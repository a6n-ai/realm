# Xplorers production runbook (Box C, ap-southeast-1 / Singapore)

Xplorers runs on its OWN EC2 box + OWN RDS in **Singapore**, separate from
tiffin-grab and puchkaman (those stay **us-east-1**). Public URL:
https://xplorers.a6n.ai. Full stack: web + pgbouncer → RDS, better-auth, SES.
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

Every key from `env.production.example`, each as a SecureString. Use the RDS
endpoint from step 1. Example:

    aws ssm put-parameter --region ap-southeast-1 --overwrite --type SecureString \
      --name /xplorers/prod/BETTER_AUTH_SECRET --value "$(openssl rand -base64 32)"

Keys: NODE_ENV, LOG_LEVEL, AWS_REGION, DATABASE_URL, DIRECT_DATABASE_URL,
PGBOUNCER_DB_HOST, PGBOUNCER_DB_PORT, PGBOUNCER_DB_USER, PGBOUNCER_DB_PASSWORD,
PGBOUNCER_DB_NAME, BETTER_AUTH_URL, BETTER_AUTH_SECRET, ACME_EMAIL,
NOTIFY_FROM_EMAIL, NOTIFY_FROM_NAME, SES_CONFIGURATION_SET.

`AWS_REGION` **must** be `ap-southeast-1`. `BETTER_AUTH_URL` is
`https://xplorers.a6n.ai`. `DATABASE_URL` uses `pgbouncer:6432` (no sslmode);
`DIRECT_DATABASE_URL` ends `?sslmode=no-verify`. Also copy `ACME_EMAIL` into
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

## Verify

    curl -I https://xplorers.a6n.ai          # HTTP/2 200 + valid TLS
    curl -I https://xplorers.a6n.ai/login
    ./deployment/prod/db-tunnel.sh xplorers  # localhost:5435 in ap-southeast-1
