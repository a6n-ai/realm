# Development & Build Workflow

All commands run from the repo root. Turbo orchestrates tasks across the
workspace; pnpm is the package manager (`pnpm@10.34.4`, pinned).

## Everyday commands

```bash
pnpm install                       # link workspace packages (run after any dep change)
pnpm dev                           # turbo run dev — starts the app(s)
pnpm dev:fresh                     # kill :3000, clear .next, then dev

pnpm turbo typecheck               # tsc --noEmit across every package
pnpm turbo lint                    # eslint (currently the app; @realm/eslint-config)
pnpm turbo test                    # vitest across packages that have tests
pnpm turbo build                   # production build
```

Scope to one app/package with a filter:

```bash
pnpm turbo typecheck --filter=tiffin-grab...   # the app + its deps
pnpm --filter tiffin-grab build                # just the app's build
pnpm --filter @realm/ui typecheck              # one package
```

## The per-change contract

Packages ship **raw source** (no build step), so `tsc` is the fast, reliable
gate — it resolves every workspace import and catches type breaks across the
whole graph. After a non-trivial change:

```bash
pnpm turbo typecheck && pnpm turbo test
```

Two failure modes `tsc` **cannot** catch — verify by eye when touching a
package's client components:
1. A stripped/missing `"use client"` directive.
2. A client symbol demoted from a named export (the `Component.Skeleton` trap).

## Production build

```bash
pnpm --filter tiffin-grab build
```

Produces `.next/standalone/` — a self-contained `server.js` + traced
`node_modules`, the Docker deploy artifact. `outputFileTracingRoot` is the
monorepo root, so the standalone output nests the app under
`apps/tiffin-grab/`; the prod `Dockerfile` COPY/CMD paths depend on that.

### Build gotchas (learned the hard way)

- **Turbopack build lock** lives at `apps/<app>/.next/lock` (a native
  file-descriptor lock), *outside* the parts `rm -rf .next` you might expect —
  but removing the whole `.next` dir does clear it **if no process holds it**.
- **"Another next build process is already running"** with no visible build
  usually means a **stale `next dev` server** is still running (especially one
  started before an `apps/` rename, pointing at a path that no longer exists) or
  a leftover Turbopack worker. Fix:
  ```bash
  pkill -f 'turbo run dev'; pkill -f 'next dev'
  pnpm exec turbo daemon stop
  rm -rf apps/tiffin-grab/.next
  ```
  If turbo's task layer keeps false-locking in one shell session, run the build
  directly in the app dir to bypass it:
  ```bash
  cd apps/tiffin-grab && pnpm exec next build
  ```

## Rebuild the database from the baseline

`apps/tiffin-grab/db/migrations/0000_*.sql` is a single hand-edited baseline
(migrations `0000`–`0007` were squashed into it). **There is no in-place
upgrade path**: an existing local DB's `drizzle.__drizzle_migrations` table
still holds the 8 old hashes, and the regenerated `0000` hash won't match row
0 — `db:migrate` errors/refuses instead of applying anything. Every existing
dev DB must be **dropped and rebuilt** with the sequence below. Realm-prod is
pre-launch (live orders are still on WooCommerce), so this drop+rebuild is the
sanctioned reset there too — no real data is lost.

```bash
# DB_URL falls back DIRECT_DATABASE_URL -> DATABASE_URL, matching db/resolve-migration-url.ts.
# Locally DIRECT_DATABASE_URL is often unset; without the fallback, psql "" would target the
# default DB/user and the migrate step (drizzle) and the psql steps could hit DIFFERENT databases.
DB_URL="${DIRECT_DATABASE_URL:-$DATABASE_URL}"

# 1. Drop everything, INCLUDING drizzle's migration-tracking schema. Skipping the
#    `drizzle` schema drop leaves the old hash rows behind, so the regenerated
#    `0000` reads as already-applied and db:migrate silently no-ops.
psql "$DB_URL" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;'
# 2. Apply the single baseline migration.
pnpm --filter tiffin-grab db:migrate
# 3. Seed catalog + reference data (idempotent).
psql "$DB_URL" -f apps/tiffin-grab/db/seed.sql
# 4. Seed login-able staff (scrypt hash can't live in SQL — a real runnable step,
#    not a comment). Not optional: skipping it yields a DB with zero users and
#    no one (admin/sales) can log in.
pnpm --filter tiffin-grab db:seed-staff
```

## Testing

Service/integration tests hit a **real seeded Postgres** (the live-DB harness);
`vitest.config.ts` runs files serially and reseeds admin/member in teardown.
Pure-logic and component-render tests need no DB. `DATABASE_URL` defaults to a
local `tiffin` database — a `CONNECT_TIMEOUT localhost:5432` in test output just
means Postgres isn't running (non-fatal for non-DB tests).

## Caching

`turbo.json` sets `globalDependencies` (`tsconfig.base.json`,
`tooling/eslint-config/**`) so shared-config changes bust task caches. Build
outputs (`.next/**`, minus cache) are cached per-package.
