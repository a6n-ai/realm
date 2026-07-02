# Self-Hosted AWS Deployment Design

**Date:** 2026-07-02
**Status:** Proposed
**Supersedes (infra only):** the Amplify Gen2 transport pieces of `2026-06-29-notification-system-design.md`

## Goal

Deploy Tiffin Grab to AWS on infrastructure we own, replacing the (never-deployed,
local-only) Amplify Gen2 backend. Introduce RabbitMQ for notification delivery,
Redis for cache + real-time fan-out, and RDS for the database. Nothing is on AWS
today — this is a greenfield deploy, not a migration.

## Non-Goals

- Kubernetes / EKS. One app + two infra services is not a cluster problem. Upgrade
  path noted at the end; not built now.
- Managed AmazonMQ / ElastiCache. Self-hosted RabbitMQ + Redis containers on the
  app box are cheaper and sufficient at current scale. RDS is the one exception
  (see rationale).
- Auto-scaling / multi-node. Scale the box (`t3.medium` → `t3.xlarge`) before
  scaling out.
- GitHub Actions CI/CD from day one. Start with a deploy script over SSH; wire CI
  when manual deploys start hurting.

## Rationale: why one EC2 box + managed RDS

The DB is the only stateful thing we cannot afford to lose with an instance. RDS
gives automated backups, point-in-time recovery, and failover for free — so it
stays managed. RabbitMQ (queues drain) and Redis (cache/pub-sub rebuilds) are
disposable enough to co-locate on the app VM. EKS costs ~$75/mo for the control
plane before any workload and buys nothing until there are multiple services or
teams. Fargate + AmazonMQ + ElastiCache roughly triples the monthly bill for the
same single-app workload.

## Target Architecture

```
  Route53 (existing domain) ──► EC2 (t3.medium, Amazon Linux 2023)
                                 │
                                 │  Caddy (:80/:443, auto-TLS via Let's Encrypt)
                                 │    │
   docker compose services:      │    ├─► web       next start :3000
                                 │    │              (SSR, better-auth, API routes, SSE)
                                 │    ├─► worker     RabbitMQ consumer → SES + Redis publish
                                 │    ├─► rabbitmq   :5672 + mgmt :15672 (bound to localhost)
                                 │    └─► redis      :6379 (bound to localhost)
                                 │
                                 └── (private subnet, SG-locked) ──► RDS Postgres
                                                                     (db.t4g.micro, backups on)
  External AWS services (IAM role on the instance, no keys in env):
    • SES  — transactional email (called by worker)
    • S3   — file storage (S3StorageProvider, already implemented)
```

Six containers, one `docker-compose.yml`, one deploy command.

## Components

### 1. Compute — EC2 + Docker Compose

- Amazon Linux 2023, `t3.medium` (2 vCPU / 4 GB) to start.
- Docker + Docker Compose plugin.
- Services: `web`, `worker`, `rabbitmq` (`rabbitmq:3-management`), `redis`
  (`redis:7`), `caddy`.
- RabbitMQ and Redis ports bound to `127.0.0.1` only — never exposed to the
  internet. Only Caddy's 80/443 open in the security group (plus SSH, IP-locked).
- **Instance IAM role** grants SES send + S3 read/write. No AWS access keys in
  env files.

### 2. Reverse proxy / TLS — Caddy

Chosen over nginx because auto-TLS (ACME/Let's Encrypt) is a two-line Caddyfile —
no certbot cron, no manual renewal. Terminates TLS, proxies `/` → `web:3000`.
SSE endpoint needs proxy buffering disabled (documented in Caddyfile).

### 3. Database — RDS Postgres

- `db.t4g.micro`, single-AZ to start, automated backups + 7-day PITR.
- Private subnet; security group allows `:5432` only from the EC2 instance SG.
- App connects via existing `apps/web/db/client.ts` (`DATABASE_URL`,
  `postgres({ max: 10 })`). Migrations run with existing `drizzle-kit migrate`
  from the deploy script.

### 4. File storage — S3 (config swap only)

`S3StorageProvider` already exists (`packages/commons-files/src/storage/s3-provider.ts`).
Production selects it via env; local/dev keeps `LocalStorageProvider`. One factory
switch on `STORAGE_DRIVER`. The `/api/files/[...key]` serving route (commit
`8592b23`) still works as the public base in front of S3 (or swap to a public
bucket/CloudFront later — not now).

### 5. Notifications — RabbitMQ + Redis, keeping the durable outbox

This is where the real design work is. The existing pattern is preserved and its
two Amplify-only limbs are replaced:

| Concern | Today (Amplify, local-only) | New (self-hosted) |
|---|---|---|
| Source of truth | Postgres outbox table | **unchanged** |
| Delivery trigger | EventBridge cron (1 min) pokes `/api/notifications/drain` | RabbitMQ push → `worker` consumes immediately |
| Delivery logic | drain route claims + sends due rows | **reused** by the worker |
| Email send | commons-notify email channel + SES | **unchanged** |
| In-app real-time | AppSync WebSocket subscription | **SSE endpoint + Redis pub/sub** |
| Safety net | (the cron itself) | slow poll of the outbox every ~2 min |

**Flow:**

1. Domain action writes the outbox row **in the same transaction** as the event
   (durability — this is why we never lose a notification, broker up or down).
2. After commit, publish a lightweight `{ outboxId }` message to RabbitMQ. This is
   fire-and-forget: if it fails, the safety-net poll still picks the row up.
3. `worker` consumes the message → claims the outbox row (same claim logic the
   drain route already uses) → delivers:
   - **email** → commons-notify email channel → SES
   - **in-app** → `PUBLISH notif:{userId}` on Redis
4. `web`'s SSE endpoint `GET /api/notifications/stream` subscribes to
   `notif:{userId}` on Redis and streams events to the connected browser. Redis
   pub/sub is what lets any `web` process serve any user's stream (multi-process
   safe, and future multi-box safe).
5. **Safety net:** worker runs a periodic poll (~2 min) claiming any due, unsent
   outbox rows — covers the publish-after-commit gap and broker downtime. This
   makes RabbitMQ a latency optimization on top of a reliable base, not a single
   point of failure.

**Client change:** the browser drops the AppSync/`aws-amplify` subscription and
opens an `EventSource('/api/notifications/stream')`. Auto-reconnect is built into
`EventSource`; on reconnect the client also refetches unread from the DB (SSE is
transport, not source of truth — same principle as the old AppSync design).

### 6. Worker process

New small entrypoint (own container, shares the monorepo image or a slim variant):
- Connects to RabbitMQ (`amqplib`) and Redis (`ioredis`).
- Consumes the notification queue; runs the shared delivery logic.
- Runs the safety-net poll on an interval.
- Idempotent: outbox row claim uses a status/locked-at guard so a message + a poll
  hit for the same row can't double-send.

## Code Changes Summary

1. **Delete** `amplify/` and remove `@aws-amplify/*`, `aws-amplify`,
   `@aws-appsync/utils` from dependencies. Remove AppSync client wiring in `web`.
2. **commons-notify:** add a RabbitMQ producer (publish `{ outboxId }` after
   commit) and a Redis publisher for in-app events. Factor the drain/deliver logic
   so both the worker and the existing route can call it.
3. **web:**
   - `GET /api/notifications/stream` — SSE handler backed by Redis subscribe.
   - Client swaps AppSync subscription → `EventSource`.
   - Keep `/api/notifications/drain`? Optional — the worker's poll supersedes it.
     Decide during planning (lean: drop it, worker owns delivery).
4. **worker:** new package/entrypoint (`apps/worker` or `packages/notify-worker`)
   — consumer + safety-net poll.
5. **commons-files:** storage factory keyed on `STORAGE_DRIVER` env
   (`local` | `s3`). No provider code needed — both already exist.
6. **Infra (new files):** `docker-compose.yml`, `Dockerfile` (multi-stage,
   monorepo-aware, `next build` → `next start`), `Caddyfile`, `deploy.sh`,
   `.env.production.example`.

## Deployment Flow

`deploy.sh` on the box:
```
git pull
docker compose build
pnpm --filter web db:migrate    # drizzle-kit migrate against RDS
docker compose up -d
```
Provisioning (one-time, documented in a README): launch EC2, attach IAM role,
install Docker, point the domain's A record at the elastic IP, create RDS + S3 +
SES verified identity, drop in `.env.production`.

## Error Handling

- **RabbitMQ down:** publishes fail silently; safety-net poll delivers. No loss.
- **Redis down:** in-app real-time stops; email path (via SES) unaffected; DB
  still records notifications; clients still see them on next fetch/refresh.
- **SES throttle / send failure:** outbox row stays unsent (claim released),
  retried by the next poll with backoff. Cap retries → dead-letter status column.
- **RDS failover:** `postgres` client reconnects; in-flight requests error and
  retry at the app level.
- **Worker crash:** Docker `restart: unless-stopped`; unacked RabbitMQ messages
  requeue; poll reconciles.

## Testing Strategy

- **Unit:** delivery/claim logic idempotency (message + poll for same row →
  single send). Storage factory selects correct provider per env.
- **Integration (live-DB harness, existing):** outbox → claim → deliver against
  seeded Postgres. Do not touch shared fixtures (`usr_system`).
- **Local compose smoke:** `docker compose up` locally with LocalStack or real
  dev creds — publish a notification, assert email queued + SSE event received.
- **Manual:** open two browser sessions, trigger a notification, confirm SSE
  delivery to the right user only (no cross-user leak — matches the old
  per-user filter guarantee).

## Cost Estimate (rough, monthly)

- EC2 t3.medium: ~$30
- RDS db.t4g.micro + storage/backups: ~$15–20
- S3 + SES + data transfer: low single digits at current scale
- **~$50–90/mo total.** (EKS equivalent starts ~$150+ before workloads.)

## Upgrade Paths (documented, not built)

- **CI/CD:** GitHub Actions → build image → push ECR → SSH deploy, when manual
  deploys become frequent.
- **Scale out:** because real-time already goes through Redis pub/sub and state
  lives in RDS, adding a second `web` box behind an ALB is incremental — no
  sticky sessions needed. EKS only if service count grows.
- **Managed services:** swap self-hosted RabbitMQ/Redis for AmazonMQ/ElastiCache
  if ops burden outweighs cost.
- **CDN:** CloudFront in front of S3 assets and the app when traffic warrants.
