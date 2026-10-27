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

- Zone `970680dc711f59ee1bb17ff536b1c61b`, created 2026-10-27 from the live Route53 zone `Z0983728P9WL0KVAG4E2` (`dns/tiffingrab.ca.zone`). Registrar Open Provider, managed through Hostinger: set nameservers `kia.ns.cloudflare.com` / `zac.ns.cloudflare.com` there.
- Every record is DNS only. Proxying `app`/apex needs Caddy and the app to trust Cloudflare's client-IP header first (rate limits, audit IPs), so it is a separate change.
- Mail records (Titan MX/SPF/DKIM, SES DKIM and MAIL FROM for the apex and `notify.`) must never be proxied.
- After the nameservers move and the zone is active: export the zone over `dns/tiffingrab.ca.zone`, then delete the Route53 zone and retire `deployment/dns/route53-tiffingrab.yaml`.

## a6n.ai

- Registrar Namecheap, nameservers `kia.ns.cloudflare.com` / `zac.ns.cloudflare.com` since 2026-10-23 (was Route53 `Z05881901LHJHX7AHKCFJ`).
- Apex A records point at GitHub Pages (aether site). Keep them DNS only: proxying breaks the Pages certificate renewal.
- `hi@a6n.ai` forwards to the owner's Gmail through Cloudflare Email Routing (routing MX/SPF/DKIM records are managed by Email Routing, do not edit them by hand).
- `xplorers.a6n.ai` and its SES records (`*._domainkey.xplorers`, `mail.xplorers`) are copies of what the `xplorers-prod` / `xplorers-ses` stacks created in Route53. When the box IP or SES DKIM tokens change, update them here too.
