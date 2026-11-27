# a6n agent guide

TanStack Start on Cloudflare Workers + D1. Skills to load for framework work:

- `node_modules/@tanstack/react-start/skills/react-start/SKILL.md`
- `node_modules/@tanstack/react-router/skills/react-router/SKILL.md`

## Server and client rules (same as relay-v2)

- Only `*.fns.ts` files, route files and `src/server.ts` import `cloudflare:workers`. Business code takes `env` or `db` as a parameter so tests can pass `env` from `cloudflare:test`. Exception: `src/lib/auth/index.ts` may import `waitUntil` from `cloudflare:workers` (relay-v2 precedent).
- Zod schemas live in `schemas.ts` files, not as top-level constants in route or server-function files.
- Build the Drizzle `db` per call from `env`; never hold it in a module.

## Not applicable here

Realm's Next rules (`proxy.ts`, `node_modules/next/dist/docs`, `transpilePackages`, `"use client"`) and caching rules 1, 2 and 7 do not apply: this app is not Next or OpenNext. The repo-level ReUI block does not apply either: the UI uses `@foundry/console` and `@foundry/ui` (ui-sdk) only.

## Secrets

Production secrets live in the account Secrets Store (`secrets_store_secrets` in `wrangler.jsonc`, names `A6N_*`), set by an owner in the dashboard; no script or agent sets them. Read every secret through `readSecret()` (`src/lib/secrets.ts`), never `env.X` directly: in production the binding is a store object (`await .get()`), in tests and local dev a plain string. `env.dev` (`pnpm dev`) and `env.test` (vitest) bind no store, so `.dev.vars` and the vitest bindings supply readable test values of 32+ characters.

## Organisations, roles and the super admin

Better Auth's organization plugin holds organisations, members (with their role: `owner`, `admin`, `member` or a custom role), custom roles (`organization_roles`) and teams; every business row carries `organization_id` and every service is bound to the actor's organisation. The admin plugin's `users.role` is only the platform role: `user`, or `super_admin` for the `/admin` organisations page. `super_admin` is never granted by the app or any API; an owner grants it with one statement, run by hand:

```bash
pnpm --filter a6n exec wrangler d1 execute a6n --remote --command="UPDATE users SET role = 'super_admin' WHERE email = 'person@example.com'"
```

## Data

One database, D1. Migrations are for D1 only (`drizzle/`).

## Vite

`optimizeDeps.exclude: ["@foundry/console"]` in `vite.config.ts` works around a dev-only duplicated router context (`ConsoleRouterProvider is missing`) seen when Vite pre-bundled `@foundry/console`. Kept after the move to the git dependency: excluding a source-only package from pre-bundling costs nothing.

## Scripts

Run the deploy scripts as `pnpm run deploy` / `pnpm run deploy:apply` (`pnpm deploy` is a builtin). Agents never run `--apply` or remote wrangler.
