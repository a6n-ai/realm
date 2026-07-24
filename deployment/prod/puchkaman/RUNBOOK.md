# Puchkaman production runbook (Box B)

Puchkaman runs on its OWN EC2 box + OWN RDS, separate from tiffin-grab (Box A).
Full stack: web + pgbouncer → RDS, better-auth admin, S3 uploads. No redis/worker.

## 1. Provision AWS (once)

    aws cloudformation deploy --region us-east-1 \
      --stack-name puchkaman-prod \
      --template-file infra/puchkaman-prod.yaml \
      --capabilities CAPABILITY_NAMED_IAM \
      --parameter-overrides \
        VpcId=vpc-XXXX \
        DbMasterPassword='<32+ char password>' AllowSshCidr=<your-ip>/32

The stack uses the VPC's default DB subnet group (default-vpc-<vpcId>) and one
security group realm-puchkaman-prod-sg shared by the box + RDS, matching tiffin-grab.

Read the outputs:

    aws cloudformation describe-stacks --region us-east-1 --stack-name puchkaman-prod \
      --query 'Stacks[0].Outputs'

## 2. Write SSM config (/puchkaman/prod/*)

Every key from `.env.production.example`, each as a SecureString. Use the RDS
endpoint from step 1. Example (repeat per key):

    aws ssm put-parameter --region us-east-1 --overwrite --type SecureString \
      --name /puchkaman/prod/BETTER_AUTH_SECRET --value "$(openssl rand -base64 32)"

Keys: NODE_ENV, LOG_LEVEL, DATABASE_URL, DIRECT_DATABASE_URL, PGBOUNCER_DB_HOST,
PGBOUNCER_DB_PORT, PGBOUNCER_DB_USER, PGBOUNCER_DB_PASSWORD, PGBOUNCER_DB_NAME,
BETTER_AUTH_URL, BETTER_AUTH_SECRET, ACME_EMAIL, AWS_REGION, FILES_S3_BUCKET,
FILES_S3_REGION. (DATABASE_URL uses pgbouncer:6432; DIRECT_DATABASE_URL ends
`?sslmode=no-verify`.) Also copy ACME_EMAIL into `proxy/.env.production`.

## 3. First-time box bring-up

EC2: Amazon Linux 2023, **x86_64**, t3.small, 30 GiB gp3 encrypted, tag
Name=`realm-puchkaman-prod`, in the SG (`SecurityGroupId` output = realm-puchkaman-prod-sg),
IAM instance profile `realm-puchkaman-prod-role` (`InstanceProfileName` output).
Install docker + compose + awscli + jq + git.

    git clone https://github.com/a6n-ai/realm ~/realm
    cd ~/realm/deployment/prod/puchkaman
    docker network create edge
    # ACME_EMAIL comes from SSM (not committed — repo is public). Box B's
    # instance role can read /puchkaman/prod/*.
    printf 'ACME_EMAIL=%s\n' "$(aws ssm get-parameter --region us-east-1 \
      --with-decryption --name /puchkaman/prod/ACME_EMAIL \
      --query Parameter.Value --output text)" > proxy/.env.production
    (cd proxy && docker compose up -d)
    ./deploy.sh    # generates .env.production from SSM, migrates baseline, up -d

## 4. Cutover (from Box A)

**TLS chicken-and-egg:** Caddy can't issue a real Let's Encrypt cert for
puchkaman.ca until DNS points at Box B (ACME needs the public name to resolve
here). Until the flip, puchkaman.ca still resolves to Box A. So verify in two
phases: app-level over the IP with cert-check relaxed BEFORE the flip, real TLS
AFTER.

1. **Pre-flip (app-level, `-k` because the cert isn't issued yet).** Point the
   Host at Box B by IP and accept Caddy's internal cert:

       IP=<BoxB-IP>
       curl -k --resolve puchkaman.ca:443:$IP -I https://puchkaman.ca/        # expect 200
       curl -k --resolve puchkaman.ca:443:$IP -I https://puchkaman.ca/login   # expect 200
       # admin path redirects to /login without a session (302) — proves proxy.ts + app boot:
       curl -k --resolve puchkaman.ca:443:$IP -o /dev/null -w '%{http_code}\n' \
         https://puchkaman.ca/dashboard

   Then in a browser (accept the cert warning), log in and create a product +
   test an S3 upload — this exercises the NEW RDS + NEW bucket end to end.
   Also confirm the baseline migrated: `docker compose --profile tools run --rm
   migrate` in step 3 above prints "No migrations to apply" on a second run.

2. **Flip DNS** puchkaman.ca (+ www) → Box B public IP (Route53). Within a
   minute or two Caddy completes ACME. Then verify **real** TLS:

       curl -I https://puchkaman.ca/          # 200, valid cert, no -k
       curl -I https://puchkaman.ca/login     # 200

3. On Box A: `cd ~/realm/deployment/prod && (cd puchkaman && docker compose down)`
   then `docker image rm ghcr.io/a6n-ai/puchkaman-web:latest || true`. Box A's
   shared Caddy no longer references puchkaman (see proxy/Caddyfile).

## 5. Redeploy (steady state)

Push to main → CI builds puchkaman-{web,tools} → deploy job SSHes Box B and runs
`deploy.sh` (needs repo secret `EC2_HOST_PUCHKAMAN` + `ENABLE_SSH_DEPLOY=true`).
Manual: `cd ~/realm/deployment/prod/puchkaman && ./deploy.sh`. Rollback:
`IMAGE_TAG=<sha> ./deploy.sh`.

## Local dev note

Migrations were squashed to a single baseline. Re-init your local puchkaman DB:
`dropdb puchkaman && createdb puchkaman && pnpm --filter puchkaman exec drizzle-kit migrate`.
