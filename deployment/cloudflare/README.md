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
- Since the 2026-11-03 cutover, `tiffingrab.ca`, `www` and `app` are custom domains of the `tiffin-grab` Worker (proxied); `rt` is `realtime-tiffin-grab`. `app` TTL was lowered to 60 s for the cutover. WAF custom rules (403; Free plan cannot send a custom 410): `01f4d514…` WordPress paths on apex/www; `70337cfe…` scanner probes (`.env`, `.git`, Dockerfiles, lockfiles, …) on apex/www/app so they never burn Worker CPU.
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
- **tiffin-grab: do not let wrangler minify the OpenNext bundle** (2026-11-03). Its minify turns the
  lazy wrapper of the 53 MB server handler into an arrow function, and a cold isolate then spends
  ~1 s compiling it on the first request, even for `/robots.txt` (local workerd: 0.9 s, vs 0.47 s
  when the same unminified bundle is minified afterwards as plain text). `cloudflare/prebundle.mjs`
  does that and wrangler ships it with `no_bundle`. A static `import` of the handler is not an
  alternative: its top level builds the Next server before the request context exists.
- Measured `/` and `/whats-on`: EC2 ~0.5-0.65 s; Worker warm ~0.6-1.2 s; cold 1.5-3 s.

**Setup gotchas**
- **Create Hyperdrive with `--caching-disabled true`.** The default caches SELECTs for ~60 s,
  so a page read right after a write (booking, settings save) can show old data. xplorers
  shipped with it on and was switched off on 2026-11-02.
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

### Lessons from the tiffin-grab port (2026-11-03)

- **Escape non-Latin1 characters in the bundle.** One character above U+00FF anywhere (here
  Cyrillic and dashes in `@react-pdf` regexes) makes V8 hold the whole 53M-char script as a
  two-byte string: 106 MB of the 128 MB isolate before any request. Heavy pages then pushed the
  isolate over and it was recycled after every request (outcome still `ok`), so every request
  was cold. `cloudflare/prebundle.mjs` rewrites them as `\uXXXX`: idle heap 108 -> 57 MB, warm
  `/menu` 77-125 ms CPU.
- **Minify outside wrangler.** wrangler's `minify` turns esbuild's lazy wrapper around the server
  handler into an arrow function V8 compiles about twice as slowly on a cold first request.
  Bundle unminified, minify the text with esbuild, ship `no_bundle` (cold `/robots.txt`
  1.7-3.5 s -> 0.4 s CPU).
- **Tag diagnostics, not guesses.** A temporary header with a module-level isolate id and request
  count showed in minutes whether isolates were reused. `wrangler tail` `cpuTime` alone could not.
- **Money paths and long caches.** The catalog snapshot sits in KV for 10 minutes; checkout prices
  from it, so it records the next discount start/end (`validUntil`) and is rebuilt past it.
- **Fire-and-forget is cancelled.** Any `void promise` outside `after()` dies with the response;
  route it through `runInBackground` (waitUntil).
- **Build parity.** Pass an empty `NEXT_PUBLIC_BETTER_AUTH_URL` when auth (app.) and pages (apex)
  are on different hosts, as the EC2 build did; give the prod Worker no crons until cutover.
- **Preview on the prod domain shares cookies.** Prod sets its session cookie for `.tiffingrab.ca`,
  which shadows preview's host cookie on `next.`; test preview in a private window.
- **Cutover:** lower the TTL an hour ahead (`app` was 3600 s), stop the old app's writers,
  delete the records, then `wrangler triggers deploy` attaches domains + crons with no code
  upload (seconds). The classifier blocks agents from DNS, prod psql and EC2 commands: hand the
  owner scripts.

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

| | xplorers | tiffin-grab |
|---|---|---|
| Worker | `xplorers` (`xplorers-preview` and `next.xplorers.a6n.ai` deleted 2026-11-05) | `tiffin-grab` (live 2026-11-03); `tiffin-grab-preview` and `next.tiffingrab.ca` deleted 2026-11-05 with all its resources |
| Hosts | `xplorers.a6n.ai` | `tiffingrab.ca`, `www.`, `app.`; realtime `rt.tiffingrab.ca` |
| Database | Neon `aged-dust-56644803` (aws-ap-southeast-1), branch `production` | RDS `realm-tiffin-grab-prod-db` (us-east-1, public via `sg-0b4566246ed7528e5`, 5432 only, `rds.force_ssl=1`) |
| DB roles | owner | Worker connects as `tiffin_app` (DML only, conn limit 40, default privileges for new tables); migrations run as `postgres` |
| Hyperdrive | `xplorers-prod` (direct endpoint) | `tiffin-grab-prod` `126477e0…` (caching disabled) |
| KV / Queues | none | `tiffin-grab-cache`; `tiffin-outbox` |
| GitHub secrets | `XPLORERS_DIRECT_DATABASE_URL` | `TIFFIN_GRAB_DIRECT_DATABASE_URL`; `TIFFIN_GRAB_CRON_SECRET` (GitHub cron workflow) |
| Wrangler secrets | `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `REALTIME_SECRET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `FILES_S3_ACCESS_KEY_ID`, `FILES_S3_SECRET_ACCESS_KEY` | 26: SSM `/tiffin-grab/prod` values (same auth/unsubscribe/integrations/cron secrets as EC2) + `REALTIME_SECRET` + AWS keys; preview has its own fresh auth/cron/encryption secrets |
| IAM stack | `xplorers-workers-iam` (us-east-1): `ResourceRegion=ap-southeast-1`, `FilesBucketName=xplorers-files-947042607945-ap-southeast-1-an`, `SesIdentity=xplorers.a6n.ai`, `SesConfigurationSet=xplorers-prod` | `tiffin-grab-workers-iam` (us-east-1), `EnableAwsLocation=true`, extra SES config set, `SesExtraIdentity=tiffingrab.ca` (campaigns send from info@) |

Shared GitHub secrets for every app: `CLOUDFLARE_API_TOKEN` (Workers Scripts:Edit,
Hyperdrive:Read), `CLOUDFLARE_ACCOUNT_ID`.

### Rollback

Detach the Worker's custom domain and recreate the A record to the box's Elastic IP. Only
possible while the box still exists. tiffin-grab: also refresh the EC2 env from SSM (the master
password was rotated after cutover) and `docker compose start web` on Box A
(`i-0ee52b9750c327d00`, via SSM).
