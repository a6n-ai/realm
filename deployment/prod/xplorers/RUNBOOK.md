# Xplorers production runbook (Box C, ap-southeast-1 / Singapore)

Xplorers runs on its OWN EC2 box in **Singapore** with its OWN Neon project, separate from
tiffin-grab and puchkaman (those stay **us-east-1**). Public URL:
https://xplorers.a6n.ai. Full stack: web → Neon (pooled endpoint), better-auth, SES.
No redis/worker. DNS is the existing `a6n.ai` hosted zone in Route 53.

CI builds `xplorers-web` + `xplorers-tools` on push to `main` (see
`.github/workflows/deploy-xplorers.yml`) and pushes them to GHCR. SSH deploy
is gated on `ENABLE_SSH_DEPLOY`.

## 1. Provision AWS (once) — region `ap-southeast-1`

    aws cloudformation deploy --region ap-southeast-1 \
      --stack-name xplorers-prod \
      --template-file infra/xplorers-prod.yaml \
      --capabilities CAPABILITY_NAMED_IAM \
      --tags client=xplorers app=xplorers env=prod project=realm \
      --parameter-overrides \
        DbMasterPassword='<32+ hex password>'

Stack tags (`client` / `app` / `env` / `project`) plus the same keys on every
taggable resource are how this client's AWS spend is isolated. Activate them
once per account (Billing console, or):

    aws ce update-cost-allocation-tags-status --region us-east-1 \
      --cost-allocation-tags-status \
        TagKey=client,Status=Active TagKey=app,Status=Active \
        TagKey=env,Status=Active TagKey=project,Status=Active

Cost Explorer then filters `client=xplorers`. New tags can take up to 24h to
appear. SSM parameters must be tagged at put-time too:

    aws ssm put-parameter --region ap-southeast-1 --overwrite --type SecureString \
      --tags Key=client,Value=xplorers Key=app,Value=xplorers Key=env,Value=prod Key=project,Value=realm \
      --name /xplorers/prod/BETTER_AUTH_SECRET --value "$(openssl rand -base64 32)"

The stack creates a **new VPC** in Singapore (do not pass the us-east-1 VPC),
RDS `realm-xplorers-prod-db`, box `realm-xplorers-prod`, Elastic IP, IAM role
`realm-xplorers-prod-role`, and the A record `xplorers.a6n.ai`.

    aws cloudformation describe-stacks --region ap-southeast-1 \
      --stack-name xplorers-prod --query 'Stacks[0].Outputs'

## 2. SES identity (same region)

    aws cloudformation deploy --region ap-southeast-1 \
      --stack-name xplorers-ses \
      --template-file ../../email/ses-xplorers.yaml \
      --tags client=xplorers app=xplorers env=prod project=realm

DKIM + MAIL FROM (`mail.xplorers.a6n.ai`) go into the `a6n.ai` hosted zone.
Wait until the identity is Verified (SES console, **Singapore**).

## 3. Write SSM config (`/xplorers/prod/*` in ap-southeast-1)

Every key from `env.production.example`, each as a SecureString. Database
strings come from the Neon console (section 6). Example:

    aws ssm put-parameter --region ap-southeast-1 --overwrite --type SecureString \
      --name /xplorers/prod/BETTER_AUTH_SECRET --value "$(openssl rand -base64 32)"

Keys: NODE_ENV, LOG_LEVEL, AWS_REGION, DATABASE_URL, DIRECT_DATABASE_URL,
BETTER_AUTH_URL, BETTER_AUTH_SECRET, ACME_EMAIL,
NOTIFY_FROM_EMAIL, NOTIFY_FROM_NAME, SES_CONFIGURATION_SET.

`AWS_REGION` **must** be `ap-southeast-1`. `BETTER_AUTH_URL` is
`https://xplorers.a6n.ai`. `DATABASE_URL` is Neon's `-pooler`
host and `DIRECT_DATABASE_URL` the direct host, both `?sslmode=require`. Also copy `ACME_EMAIL` into
`proxy/.env.production` on the box (or let first-time bring-up do it).

## 4. First-time box bring-up

The stack already launched the instance (AL2023, docker via user-data). After
the box is `running` and SSM-online:

    aws ssm start-session --region ap-southeast-1 --target <InstanceId>
    sudo usermod -aG docker ec2-user && newgrp docker
    git clone https://github.com/a6n-ai/realm.git ~/realm
    cd ~/realm/deployment/prod/xplorers
    docker network create edge
    printf 'ACME_EMAIL=%s\n' "$(aws ssm get-parameter --region ap-southeast-1 \
      --with-decryption --name /xplorers/prod/ACME_EMAIL \
      --query Parameter.Value --output text)" > proxy/.env.production
    (cd proxy && docker compose up -d)
    ./deploy.sh

Add the 2 GiB swapfile from `../RUNBOOK.md` "Box sizing and swap" — Box C is a `t2.micro`.

**Resizing Box C: never via the stack's `InstanceType` parameter.** The box launches from
`BoxLaunchTemplate`, so any launch-template change (instance type, or the `resolve:ssm`
latest AMI) **replaces the instance** — new root volume, box setup and Caddy certs gone.
Resize in place (stop → modify-instance-attribute → start) instead. The live stack still
records `InstanceType=t3.small` from creation; leave it.

Make GHCR packages `xplorers-web` + `xplorers-tools` **Public** after the first
CI image push (org Settings → Packages), so the box pulls with no creds.

## 5. Redeploy (steady state)

Push to main → CI builds xplorers-{web,tools} → deploy job SSHes Box C when
`ENABLE_SSH_DEPLOY=true` and secret `EC2_HOST_XPLORERS` is set. Manual:
`cd ~/realm/deployment/prod/xplorers && ./deploy.sh`. Rollback:
`IMAGE_TAG=<sha> ./deploy.sh`.

## 6. Database on Neon (moved from RDS 2026-10-01)

Why: cost. Singapore RDS is ~$21/mo; Neon Free is $0 for this load because
compute suspends after 5 min idle. xplorers goes first because it has no
outbox listener or worker that could keep the database awake.

Target: Neon org `a6n`, project `xplorers` (`aged-dust-56644803`),
`aws-ap-southeast-1` (same region as Box C), Postgres 18 (matches RDS 18.6),
branch `production`, database `xplorers`, role `xplorers`. Free plan: 512 MB
per branch, 0.25 CU. One Neon project per app, never shared across apps.

Neon has two endpoints:

- **Direct** (host without `-pooler`) → `DIRECT_DATABASE_URL`. Migrations and
  `pg_restore` use it: DDL and drizzle's bookkeeping need a real session.
- **Pooled** (host with `-pooler`) → `DATABASE_URL`. Neon runs PgBouncer in
  transaction mode there, the same mode as our pgbouncer container, so the
  container is dropped at cutover: two poolers stacked add a hop and nothing
  else, and our pooler holding server connections open could keep Neon awake.

Steps used for the move (kept for the next app):

1. Open the tunnel: `./deployment/prod/db-tunnel.sh xplorers` (port 5435).
2. Put both strings from Neon console → Connect (pooling off / on) into
   `deployment/prod/xplorers/.env.neon` (gitignored):

       NEON_URL='<direct>'
       NEON_POOLED_URL='<pooled>'

3. `./deployment/prod/neon-copy.sh xplorers`: prints RDS checks, refuses a
   non-empty target, dumps, restores, prints the same checks for Neon. The
   `migrations` count + newest `created_at`, `users`, `session` and `tables`
   must match. Any `!!` line or mismatch: stop, reset the Neon branch, rerun.
4. Save the current `/xplorers/prod/DATABASE_URL` and `DIRECT_DATABASE_URL`
   values (password manager) — they are the rollback.
5. Overwrite them in SSM (SecureString, tagged as in step 1): `DIRECT_DATABASE_URL`
   = direct string, `DATABASE_URL` = pooled string. Prod keeps using RDS until
   the next deploy regenerates `.env.production`.
6. Remove the pgbouncer service from `docker-compose.yml` (and the `PGBOUNCER_*`
   keys from SSM and `env.production.example`), push, let the deploy run.
7. Verify (below), then check `drizzle.__drizzle_migrations` on Neon still
   matches the repo journal.
8. Keep RDS ~1 week. Rollback = restore the saved SSM values, revert the
   compose change, redeploy. Writes made on Neon in between would be lost, so
   copy them back first if any matter. After the week, delete RDS
   (`DeletionPolicy: Snapshot` keeps a final snapshot).

Rule 7 in `AGENTS.md` still applies: the restore copies `__drizzle_migrations`
as-is; never hand-apply a migration on Neon to "catch it up".

## Verify

    curl -I https://xplorers.a6n.ai          # HTTP/2 200 + valid TLS
    curl -I https://xplorers.a6n.ai/login
    ./deployment/prod/db-tunnel.sh xplorers  # localhost:5435 in ap-southeast-1
