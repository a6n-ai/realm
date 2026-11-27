# a6n agent guide

TanStack Start on Cloudflare Workers + D1. Skills to load for framework work:

- `node_modules/@tanstack/react-start/skills/react-start/SKILL.md`
- `node_modules/@tanstack/react-router/skills/react-router/SKILL.md`

## Server and client rules (same as relay-v2)

- Only `*.fns.ts` files, route files and `src/server.ts` import `cloudflare:workers`. Business code takes `env` or `db` as a parameter so tests can pass `env` from `cloudflare:test`.
- Zod schemas live in `schemas.ts` files, not as top-level constants in route or server-function files.
- Build the Drizzle `db` per call from `env`; never hold it in a module.

## Not applicable here

Realm's Next rules (`proxy.ts`, `node_modules/next/dist/docs`, `transpilePackages`, `"use client"`) and caching rules 1, 2 and 7 do not apply: this app is not Next or OpenNext. The repo-level ReUI block does not apply either: the UI uses `@foundry/console` and `@foundry/ui` (ui-sdk) only.

## Data

One database, D1. Migrations are for D1 only (`drizzle/`).
