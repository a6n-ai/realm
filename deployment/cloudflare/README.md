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
6. **AWS from a Worker.** No instance role: a scoped IAM user (template like
   `xplorers/iam-workers.yaml`) whose keys are wrangler secrets.
7. **Not yet solved for tiffin-grab/puchkaman:** the Redis BLPOP listener, in-process SSE
   bus and background jobs need Queues, Cron Triggers and the realtime Worker first.

### Per-app values

| | xplorers |
|---|---|
| Worker (prod / preview) | `xplorers` / `xplorers-preview` |
| Hosts | `xplorers.a6n.ai` / `next.xplorers.a6n.ai` |
| Neon project | `aged-dust-56644803` (aws-ap-southeast-1), branches `production`, `preview` |
| Hyperdrive | `xplorers-prod`, `xplorers-preview` (direct endpoint) |
| GitHub secrets | `XPLORERS_DIRECT_DATABASE_URL`, `XPLORERS_PREVIEW_DIRECT_DATABASE_URL` |
| Wrangler secrets | `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `REALTIME_SECRET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `FILES_S3_ACCESS_KEY_ID`, `FILES_S3_SECRET_ACCESS_KEY` |
| IAM stack | `xplorers-workers-iam` (us-east-1) |

Shared GitHub secrets for every app: `CLOUDFLARE_API_TOKEN` (Workers Scripts:Edit,
Hyperdrive:Read), `CLOUDFLARE_ACCOUNT_ID`.

### Rollback

Detach the Worker's custom domain and recreate the A record to the box's Elastic IP. Only
possible while the box still exists.
