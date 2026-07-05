# Production deploy runbook — tiffin-grab

Live: **https://app.tiffingrab.ca** (EC2 `realm-tiffin-grab-prod`, us-east-1).

CI is **push-only**: pushing to `main` builds `tiffin-grab-web` + `-tools` images
and pushes them to GHCR. The deploy job is gated behind repo variable
`ENABLE_SSH_DEPLOY` (unset = off), so **you pull + run on the box yourself**.

## Architecture

```
Caddy (443, auto-TLS) ──► web (Next standalone, :3000 internal)
                          worker (tsx notify-consumer)
                          redis (cache)
app ──► pgbouncer (:6432) ──SSL──► RDS Postgres (:5432, private)
```

- **web → pgbouncer**: plaintext, local compose network. `DATABASE_URL` has **no** sslmode.
- **pgbouncer → RDS**: SSL via `SERVER_TLS_SSLMODE=require` (pgbouncer config, not a URL).
- **drizzle-kit → RDS**: direct, SSL. `DIRECT_DATABASE_URL` **must** end `?sslmode=no-verify`.

## Redeploy (steady state)

New code merged to `main` → CI publishes images → on the box:

```bash
cd ~/realm/deployment/prod
./deploy.sh          # git pull (config) + docker compose pull (images) + migrate + up -d
```

`deploy.sh` sources `.env.production` and pins `IMAGE_TAG=latest` (or pass a SHA to
pin/rollback: `IMAGE_TAG=<sha> ./deploy.sh`).

## First-time box bring-up

1. **EC2**: Amazon Linux 2023, **x86_64** (CI images are amd64 — Graviton breaks them),
   `t3.small`, 30 GiB gp3 encrypted, IAM instance profile `realm-tiffin-grab-prod-role`
   (CloudWatch logs + SES). SG opens 22/80/443.
2. **Elastic IP** associated (permanent public IP; dynamic IP breaks DNS on stop/start).
3. **RDS** Postgres, same VPC, `Public access = No`, initial DB `tiffin`, DB SG allows
   **5432 from the EC2 SG**.
4. **DNS**: Hostinger A record `app` → the Elastic IP. `www`/root left untouched.
5. **GHCR**: `tiffin-grab-web` + `-tools` set **Public** (org Settings → Packages must
   allow public first), so the box pulls with no creds.
6. On the box:
   ```bash
   sudo dnf install -y docker git
   sudo systemctl enable --now docker
   sudo usermod -aG docker ec2-user && newgrp docker
   sudo mkdir -p /usr/libexec/docker/cli-plugins
   sudo curl -sL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
     -o /usr/libexec/docker/cli-plugins/docker-compose && sudo chmod +x $_
   git clone https://github.com/a6n-ai/realm.git ~/realm
   cd ~/realm/deployment/prod
   cp .env.production.example .env.production
   nano .env.production          # see below
   ```

## .env.production essentials

```bash
DATABASE_URL=postgres://postgres:PASS@pgbouncer:6432/tiffin                       # NO sslmode
DIRECT_DATABASE_URL=postgres://postgres:PASS@<rds-endpoint>:5432/tiffin?sslmode=no-verify
PGBOUNCER_DB_HOST=<rds-endpoint>   PGBOUNCER_DB_PORT=5432
PGBOUNCER_DB_USER=postgres   PGBOUNCER_DB_PASSWORD=PASS   PGBOUNCER_DB_NAME=tiffin
BETTER_AUTH_URL=https://app.tiffingrab.ca   DOMAIN=app.tiffingrab.ca
BETTER_AUTH_SECRET=$(openssl rand -base64 32)   CRON_SECRET=$(openssl rand -hex 32)
ACME_EMAIL=you@tiffingrab.ca   AWS_REGION=us-east-1
NOTIFY_FROM_NAME="Tiffin Grab"                                                    # quote spaces!
# S3 optional; blank = local-disk file fallback
```

Use a **hex** RDS password (`openssl rand -hex 24`) to avoid URL-encoding special chars.
Values with spaces (e.g. `NOTIFY_FROM_NAME`) must be **quoted** — `deploy.sh` sources the file.

## First deploy: migrate + single admin

```bash
docker compose --env-file .env.production --profile tools run --rm migrate     # applies schema
docker compose --env-file .env.production up -d

# seed ONE admin — route through pgbouncer (postgres-js rejects RDS's cert on a direct SSL hop)
docker compose --env-file .env.production --profile tools run --rm \
  -e DATABASE_URL='postgres://postgres:PASS@pgbouncer:6432/tiffin' \
  -e SEED_ADMIN_EMAIL='you@tiffingrab.ca' -e SEED_ADMIN_PASSWORD='StrongPass123!' \
  --entrypoint sh migrate -c 'cd /app/apps/tiffin-grab && node_modules/.bin/tsx db/seed-admin.ts'
```

## Verify

```bash
docker compose --env-file .env.production ps            # all Up/healthy
curl -I https://app.tiffingrab.ca                       # HTTP/2 200 + valid TLS
docker compose --env-file .env.production logs --tail=30 caddy   # cert obtained
```

## Gotchas hit during first deploy (all fixed in-repo, listed so they're not re-diagnosed)

- **drizzle-kit dies silently mid-"applying migrations"** → RDS wants SSL; the `pg`
  driver connected plaintext. `DIRECT_DATABASE_URL` needs `?sslmode=no-verify`.
- **Seed fails "self-signed certificate in certificate chain"** → postgres-js (unlike
  `pg`) ignores `sslmode=no-verify` on a direct RDS hop. Route seeds through pgbouncer
  (`-e DATABASE_URL=...@pgbouncer:6432/...`).
- **pgbouncer "unhealthy", web won't start** → image defaults `listen_port=5432` but
  everything targets 6432. Fixed: `LISTEN_PORT=6432` in `pgbouncer/docker-compose.yml`.
- **compose warns `${VAR} not set`** → run compose with `--env-file .env.production`
  (or via `deploy.sh`, which sources it). The `env_file:` directive still feeds
  containers, but `${...}` interpolation needs the flag.

## DB access from a laptop

RDS is private. Tunnel through the box (IntelliJ/DBeaver → SSH tunnel):
host `<eip>`, user `ec2-user`, key `.pem`; DB host = RDS endpoint, port 5432, db `tiffin`.

## Enable CI auto-deploy (optional)

Set repo var `ENABLE_SSH_DEPLOY=true` + secrets `EC2_HOST` / `EC2_USER=ec2-user` /
`EC2_SSH_KEY` (private key). Then every push to `main` SSHes in and runs `deploy.sh`.
