# Puchkaman — new client app + multi-app deploy

Status: **Phase 1 shipped on branch `worktree-puchkaman` (not merged to main).**
Public marketing site built + verified; admin/DB deferred; go-live pending.

## Goal

Add `puchkaman` as a new Realm client app (per `docs/realm/add-a-client.md`),
implementing the "Puchkaman" neobrutalist design system, and host it at
**puchkaman.ca** on the **same EC2** as `tiffin-grab`.

Design source: claude.ai Design project via the DesignSync MCP —
projectId `87a54bff-2aed-447f-a73a-909816b42c61`. Yellow/ink neobrutalist,
Archivo + Space Mono, hard offset shadows, warm dark-espresso dark mode.

## Done (2 commits on `worktree-puchkaman`, both verified)

### 1. `apps/puchkaman` — public neobrutalist site
- `app/globals.css` — full design system ported verbatim from the project's
  `styles.css` (tokens, automatic shadow/border cascade, dark mode, animations,
  responsive folded in from the source `index.html`).
- `components/brutal/{shared,chrome,reveal,anim-ready}.tsx` — primitives
  re-authored from CDN-React to Next: `Btn/Ph/Pill/Stars/SectionHead/Marquee/
  PageBanner/Reveal`, `Nav/Footer/ThemeToggle`. `Stars` uses `useId()` (no
  hydration mismatch); `Btn` maps the design's `page` prop → real routes and
  renders `<button>` for action-only clicks.
- `app/(marketing)/` — 8 pages: home, menu, fusion, catering, events, order,
  about, contact. Hash-router → real Next routes; forms + scroll-spy are client
  components; pre-paint theme boot script in the root layout (no light flash).
- Verify: `pnpm --filter puchkaman typecheck` + `build` both green (9 static routes).

### 2. `deployment/prod` — multi-app layout (shared Caddy)
- `proxy/` — standalone Caddy, sole public ingress, routes by host to
  `<app>-web:3000` over an external `edge` docker network
  (`{$TG_DOMAIN}` → tiffin-grab, `puchkaman.ca`/`www` → puchkaman).
- `tiffin-grab/` — existing stack relocated; Caddy extracted; `web` joins `edge`
  as container `tiffin-grab-web` (runtime otherwise identical).
- `puchkaman/` — minimal web-only stack (no DB/redis/worker/migrate), joins
  `edge` as `puchkaman-web`.
- `Dockerfile` — parameterized `ARG APP` (default `tiffin-grab`); one file builds
  any client's standalone image.
- CI (`.github/workflows/deploy.yml`) — adds `puchkaman-web` build
  (`--build-arg APP=puchkaman`); deploy job runs `deploy-all.sh`.
- `deploy-all.sh` orchestrator + per-app `deploy.sh`; `RUNBOOK.md` rewritten for
  the layout. All 3 compose stacks validated with `docker compose config`.

## Decisions

- **Same EC2 now.** puchkaman is a tiny static site; the per-app-folder + `edge`
  + `ARG APP` design already makes a later split to its own box a copy-and-DNS
  move with **zero** tiffin-grab changes. Split when it earns a backend / SLA.
- **Admin / auth / DB deferred** ("don't need admin for now"). When built later:
  reuse `@realm/crm` (stock shadcn, like tiffin-grab), NOT the neobrutalist §10
  dashboard spec — and scope the brutal `globals.css` under a root class so
  `.grid/.card/.flex` don't collide with Tailwind on the dashboard.
- Domain `puchkaman.ca` (+ `www`); region `us-east-1`; currency CAD (design
  already uses `$`).

## Remaining work

1. **AWS read check** (aws-mcp, SigV4 read-only, us-east-1): describe EC2
   instances / SGs / Elastic IPs — locate the tiffin-grab box, confirm 80/443
   open, check headroom for a second container.
2. **Visual QA** of the public site (light + dark) — pending; Chrome profile was
   busy on first attempt.
3. **Go-live**: DNS A records (`puchkaman.ca` + `www` → box IP) → merge to main →
   CI builds `puchkaman-web` → on the box run the cutover in `RUNBOOK.md`
   (`git pull`, `docker network create edge`, move tiffin-grab `.env` into
   `tiffin-grab/`, create `proxy/.env.production` with `ACME_EMAIL` + `TG_DOMAIN`,
   `./deploy-all.sh`). tiffin-grab cutover = minutes downtime + one Caddy cert
   re-issue (new `caddy_data` volume). RDS untouched.
4. **Open question**: split `proxy/Caddyfile` into per-app `import sites/*.caddy`
   fragments so future per-box splits are frictionless.

## Notes / cautions

- The AWS CLI on the dev machine is authed as account **root** — use a scoped
  IAM user before any write work; keep aws-mcp read-only until then.
- Restructure **moves tiffin-grab's live deploy layout** — the first
  `deploy-all.sh` needs the box's `.env.production` relocated into `tiffin-grab/`
  and a new `proxy/.env.production` created.
