# Cloudflare

Everything Realm runs on Cloudflare. AWS pieces stay where they are (`prod/`, `dns/`, `email/`, `cdn/`).

- Account: `04244aeac63353bc0ecc1ee64058cd82` (the `cf` CLI's default profile).
- CLI: `cf` (`cf auth whoami` to check the account before any change).

## Layout

| Path | What |
|---|---|
| `dns/a6n.ai.zone` | Snapshot of the live a6n.ai zone. Edit with `cf dns records …`, then re-export: `cf dns records export -z a6n.ai`. |
| `realtime/` | Per-app deploy config for the realtime Worker (code ships in foundry `services/realtime`). Deploy: `pnpm exec wrangler deploy --config deployment/cloudflare/realtime/wrangler.jsonc --env xplorers`. Secret: `REALTIME_SECRET` (`wrangler secret put`, never committed). Run from a checkout after `pnpm install` (config `main` points into `node_modules`); always pass `--env <app>`. |

## tiffingrab.ca

- Zone `970680dc711f59ee1bb17ff536b1c61b`, copied 2026-10-27 from the live Route53 zone `Z0983728P9WL0KVAG4E2` (`dns/tiffingrab.ca.zone`). Registrar Open Provider, managed through Hostinger; nameservers `kia.ns.cloudflare.com` / `zac.ns.cloudflare.com` since 2026-10-27 (zone active 15:10 UTC).
- Every record is DNS only. Proxying `app`/apex needs Caddy and the app to trust Cloudflare's client-IP header first (rate limits, audit IPs), so it is a separate change.
- Mail records (Titan MX/SPF/DKIM, SES DKIM and MAIL FROM for the apex and `notify.`) must never be proxied.
- Left: delete the Route53 zone (after 2026-10-29, once cached NS expire) and retire `deployment/dns/route53-tiffingrab.yaml`.

## a6n.ai

- Registrar Namecheap, nameservers `kia.ns.cloudflare.com` / `zac.ns.cloudflare.com` since 2026-10-23 (was Route53 `Z05881901LHJHX7AHKCFJ`).
- Apex A records point at GitHub Pages (aether site). Keep them DNS only: proxying breaks the Pages certificate renewal.
- `hi@a6n.ai` forwards to the owner's Gmail through Cloudflare Email Routing (routing MX/SPF/DKIM records are managed by Email Routing, do not edit them by hand).
- `xplorers.a6n.ai` and its SES records (`*._domainkey.xplorers`, `mail.xplorers`) are copies of what the `xplorers-prod` / `xplorers-ses` stacks created in Route53. When the box IP or SES DKIM tokens change, update them here too.

## Apps on Workers (OpenNext)

Any Realm app can run on Cloudflare Workers instead of an EC2 box. xplorers is the first;
copy its shape. Plan and history: `docs/superpowers/plans/2026-11-02-xplorers-workers-port.md`.

### Port an app

1. **Runtime seam.** Copy `apps/xplorers/lib/runtime/{platform,background}.ts`. `isWorkers()`
   is the only runtime check; `trustedIpHeaders()` gives Better Auth exactly one client-IP
   header per runtime; `runInBackground()` replaces every un-awaited promise (Workers cancel
   them when the response ends).
2. **DB client.** Follow `apps/xplorers/db/client.ts`: plain singleton on Node, a `Proxy`
   resolving a one-connection client per request on Workers (Hyperdrive pools). Never share
   an in-flight query promise across requests (see the org snapshot in `apps/xplorers/proxy.ts`).
3. **Auth.** `rateLimit: { storage: "database" }` plus the `rate_limit` table (generate with
   `/new-migration`), and `ipAddress: { ipAddressHeaders: trustedIpHeaders() }`.
4. **Build config.** `open-next.config.ts` (`defineCloudflareConfig()`), `wrangler.jsonc`
   (top level = production, `env.preview` = staging host), scripts `cf:build`, `cf:preview`,
   `cf:deploy`, and `@opennextjs/cloudflare` + `wrangler` pinned exactly.
5. **Deploy.** A small caller workflow like `deploy-xplorers-workers.yml` that uses
   `.github/workflows/deploy-worker.yml` (inputs `app`, `site-url`, `wrangler-env`).
6. **AWS from a Worker.** No instance role: deploy `worker-iam.yaml` once per app (stack
   `<app>-workers-iam`; parameters app, region, files bucket, SES identity + config set).
   It stores the key in Secrets Manager at `/<app>/workers/aws-access-key`; copy it into
   wrangler secrets.
7. **Not yet solved for tiffin-grab/puchkaman:** the Redis BLPOP listener, in-process SSE
   bus and background jobs need Queues, Cron Triggers and the realtime Worker first.

### Lessons from the xplorers port (2026-11-02)

Read these before porting tiffin-grab or copper-cloves.

**Speed**
- **Place the Worker next to the database.** Workers run in the visitor's city by default.
  From Delhi to Neon in Singapore, `/` took ~6 s because every query crossed the region.
  `"placement": { "mode": "targeted", "region": "aws:<db-region>" }` brought it to ~1 s.
  Smart Placement needs traffic samples first, so prefer targeted. Check the `cf-placement`
  response header (`remote-SIN` = working).
- **Give each request a few connections** (`max: 5` in `db/client.ts`) so a page's parallel
  queries run in parallel; Hyperdrive does the real pooling.
- **Profile CPU before redesigning.** Workers bill and time CPU. Profile the Node build
  (`node --cpu-prof .next/standalone/apps/<app>/server.js` against a Neon branch) and read
  the top self-time functions. On xplorers, building `Intl.DateTimeFormat` on every call
  was ~40% of page CPU; `lib/intl/date-format.ts` caches them. Expect the same in
  tiffin-grab (dates and timezones everywhere).
- **Cold starts are the real cost.** A 5.6 MiB bundle costs 600-1100 ms of CPU on the first
  request in a fresh isolate, against ~250 ms warm. Low-traffic apps hit many cold starts.
  Two levers: stream data sections behind `<Suspense>` so static copy shows at once (done
  on xplorers Home and What's On), and a keep-warm Cron Trigger hitting a database-free
  `/api/health` every minute. **Never** ping a page that queries the database, or Neon
  never sleeps. xplorers runs no cron (pilot; warm `/api/health` by hand before demos).
- Measured `/` and `/whats-on`: EC2 ~0.5-0.65 s; Worker warm ~0.6-1.2 s; cold 1.5-3 s.

**Setup gotchas**
- OpenNext's `deploy` starts a local wrangler, so **every env needs a Hyperdrive
  `localConnectionString`**, and local Hyperdrive rejects a URL without a password.
- Set `"workers_dev": false` and `"preview_urls": false`, or the prod Worker is public on
  `*.workers.dev` with the prod DB behind it.
- A new custom domain needs ~1 minute for DNS and the certificate.
- Cloudflare bot protection returns 403 to script user agents (Python urllib); real browsers
  are fine. Use a browser user agent when smoke-testing.
- `wrangler tail --format json` gives `cpuTime`/`wallTime` per request. App logs (pino) do
  not show there; check SES/CloudWatch metrics to confirm sends.
- Secrets: a hook blocks agents from reading Secrets Manager, and `asm-exec` could not
  resolve here, so the owner pipes AWS keys into `wrangler secret put`. SSM values can be
  piped straight into `wrangler secret put` without printing. `realm-admin` lacks
  CloudFormation and SSM read; deploy IaC through the AWS MCP connection.
- Better Auth: trust exactly one client-IP header per runtime (`cf-connecting-ip` on
  Workers, `x-real-ip` behind Caddy; never both). Keep rate-limit counters in Postgres on
  Workers only, so the EC2 build never depends on the `rate_limit` table.

**Before porting the next app**
- **tiffin-grab:** stays on RDS (owner, 2026-11-02). RDS is private, so Hyperdrive needs RDS
  made publicly reachable (TLS, strong credentials) or a Cloudflare Tunnel on a host inside
  the VPC; decide that first. Also replace the Redis BLPOP listener (Queues), the in-process
  SSE bus (realtime Worker), scheduled jobs (Cron Triggers) and the Redis page cache (KV or
  Cache API). Its DB is awake ~80% of the day, so DB cost does not drop. Traffic is higher,
  so cold starts matter less than on xplorers. Turning on the Cloudflare proxy for
  `tiffingrab.ca` (free CDN for Canada) needs Caddy and the app to trust `CF-Connecting-IP`.
- **copper-cloves** (separate repo, not Realm): EC2 `copper-cloves-prod-box` (t4g.small) and
  RDS `copper-cloves` (db.t4g.micro), both in ap-south-1, ~5 DB connections steady. The same
  RDS-private question applies; place the Worker in `aws:ap-south-1`.
- Costs: Workers Paid is $5/month per account (all Workers), 10M requests + 30M CPU-ms
  included. At ~0.5 s CPU per heavy page, that covers ~50k such views a month.

### Per-app values

| | xplorers |
|---|---|
| Worker (prod / preview) | `xplorers` / `xplorers-preview` |
| Hosts | `xplorers.a6n.ai` / `next.xplorers.a6n.ai` |
| Neon project | `aged-dust-56644803` (aws-ap-southeast-1), branches `production`, `preview` |
| Hyperdrive | `xplorers-prod`, `xplorers-preview` (direct endpoint) |
| GitHub secrets | `XPLORERS_DIRECT_DATABASE_URL`, `XPLORERS_PREVIEW_DIRECT_DATABASE_URL` |
| Wrangler secrets | `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `REALTIME_SECRET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `FILES_S3_ACCESS_KEY_ID`, `FILES_S3_SECRET_ACCESS_KEY` |
| IAM stack | `xplorers-workers-iam` (us-east-1): `ResourceRegion=ap-southeast-1`, `FilesBucketName=xplorers-files-947042607945-ap-southeast-1-an`, `SesIdentity=xplorers.a6n.ai`, `SesConfigurationSet=xplorers-prod` |

Shared GitHub secrets for every app: `CLOUDFLARE_API_TOKEN` (Workers Scripts:Edit,
Hyperdrive:Read), `CLOUDFLARE_ACCOUNT_ID`.

### Rollback

Detach the Worker's custom domain and recreate the A record to the box's Elastic IP. Only
possible while the box still exists.
