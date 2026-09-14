---
name: scaffold-client
description: >
  Scaffold a new Realm client app under apps/<client> (Next.js 16, Better Auth,
  Foundry CRM). Use when adding a client, cloning Xplorers, creating apps/*,
  or when the user says scaffold, new app, new client, or worktree for a client.
  Do not copy Puchkaman Clover/commerce. Pair with Foundry skills next-foundry-app
  and foundry-auth.
---

# /scaffold-client

Lean copy of **`apps/xplorers`**, not Puchkaman or TiffinGrab. Product features
come later. Shared packages stay in Foundry (`@foundry/*`) and Relay (`@relay/*`).

If the current tree has unrelated dirty work, **create a git worktree** first
so that WIP stays untouched.

Then follow Foundry: `next-foundry-app` (transpile, CSS `@source`, CrmShell) and
`foundry-auth` (Better Auth + `@foundry/auth` / `@foundry/auth-ui`). Those skills
live in the sibling `foundry` repo under `.claude/skills/`.

## Shape

| Surface | Path | Role |
|---|---|---|
| Public marketing | `/`, `/about`, … | anonymous |
| Family / customer | `/me`, `/signup` | `user` |
| Staff CRM | `/dashboard` | `admin`, `member` |
| Auth | `/login`, `/forgot-password`, `/set-password`, `/no-access` | mixed |

`apps/*` is already a pnpm workspace glob — do not edit `pnpm-workspace.yaml`
unless adding a package (packages do not live in Realm).

## Do

1. Copy `apps/xplorers` → `apps/<slug>`. Rename package `"name"`, port, DB name,
   brand org code, `.env.example`, seed emails.
2. Replace every Xplorers/xplorers.life string. Split brand constants into
   `lib/brand.ts` (client-safe) vs `lib/seo.ts` (`buildMetadata` only).
3. Hand-write `db/migrations/0000_baseline.sql` with `next_id()` /
   `current_app_id()` — **drizzle-kit does not emit them**. Snapshot + journal
   tag `0000_baseline`. After generate, if those functions vanished, splice
   them back (see `new-migration`).
4. Wire CI: `.github/workflows/ci.yml` `--filter=<slug>`, plus `PROJECT.md`,
   `AGENTS.md`, `EXTRACTION.md`, `konsistent.json` if it lists apps.
5. `createdb`, migrate, seed admin (`passwordSet: false`) + brand org.
6. Verify: `pnpm turbo typecheck --filter=<slug>...` and
   `pnpm --filter <slug> test`. Browser: public pages, staff first-login
   password gate, family signup → `/me`, customer hitting `/dashboard` → `/me`.

Full file checklist: [references/checklist.md](references/checklist.md)

## Do not

- Copy Clover, Uber Eats, cart, products, orders, or Puchkaman brutalism.
- Put product-specific code in `@foundry/*` until a *second* client needs it.
- Use `middleware.ts` — Next 16 route protection is `proxy.ts`.
- Rewrite an applied migration.
- Enable Better Auth `/sign-up/email` or email-otp auto-create. Keep
  `disableSignUp: true` on **both** plugins; customers use a custom
  `signUpCustomer` action.
- Import `Metadata` into client components (keep it in `lib/seo.ts`).
- Transpile only the packages you list in `package.json`. Nested
  `@foundry/realtime` / `@foundry/email` must be **direct** deps as well, or
  Turbopack reports `Unknown module type`.
- Land members on `/no-access` if `/dashboard` already admits `member`.
- Commit unless asked. When pushing, this repo’s preference is **main**.
