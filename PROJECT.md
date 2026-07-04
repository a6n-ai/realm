# Realm

A multi-client CRM + subscription **platform**. One Turborepo, many Next.js client
apps sharing `@realm/*` packages (UI, CRM shell, services, utilities). **TiffinGrab**
is the first client — a customizable tiffin (home-style meal) delivery service in the
Greater Toronto Area (GTA). Gym, Dentist, Realtor, etc. are added as sibling apps.

See [`docs/realm/`](docs/realm/) for the repo structure, package taxonomy,
add-a-client / add-a-package guides, and the dev/build workflow.

---

## Vision

One platform spanning three audiences per client app, behind a single login:

- **Customers** subscribe to customizable plans (e.g. tiffin: nutrition baseline →
  meal size → schedule → duration), receive weekly menus, and pick what they eat each day.
- **Sales staff** capture inquiries, move them through a follow-up pipeline to converted,
  and create orders on a customer's behalf.
- **Admins** control the product catalog, weekly releases, user roles, and
  per-user feature flags.

---

## Roles

A single login per client serves all three role types (resolved at sign-in).
`Role` enum lives in `@realm/commons` (`enums.ts`):

| Role | Who | Capabilities |
|------|-----|--------------|
| `admin`  | Operators | Manage users, roles, feature flags, catalog, weekly menus |
| `member` | Sales / staff agents | Inquiries pipeline, create orders for customers (subsystem D) |
| `user`   | Customers / subscribers | Run the subscription wizard, manage own subscription & menu picks |

---

## Subsystem map & roadmap

The product is decomposed into independently shippable subsystems. Each gets its own
spec → plan → implementation cycle. Specs live in `docs/superpowers/specs/`.

| # | Subsystem | Status | Summary |
|---|-----------|--------|---------|
| **A** | Foundation | **MVP** | Monorepo, DB + Drizzle ORM, base-entity + repo/service stack, env, seed |
| **B** | Auth + RBAC + feature flags | **MVP** | Single better-auth login, roles, normalized per-user feature flags, admin grants |
| **C** | Subscription wizard + checkout | **MVP** | 4-step plan builder → 2-step checkout → activation + auto-provision |
| **D** | Inquiries CRM | Planned | Sales-agent inquiry pipeline (new → follow-up → converted), order creation, editable catalog admin |
| **E** | Weekly-menu engine | Planned | Release weekly menu, per-day per-tiffin meal selection (the customization core) |
| **F** | Marketing website | Planned | Public site revamp around the platform |

### D — Inquiries CRM (planned)
- Inquiry entity with pipeline stages: `new → contacted → follow_up → converted → lost`.
- Sales agent (`member`) creates/edits inquiries, logs follow-ups, converts to a subscription.
- Sales agent creates orders on behalf of a customer (reuses the pricing engine).
- Admin catalog editor (CRUD over plans, meal sizes, add-ons, discount rules, zones)
  — replaces the seed as source of truth.

### E — Weekly-menu engine (planned)
- Admin releases a weekly menu (dishes available per plan, per day).
- Subscribers select each meal for each day within their active subscription.
- Locks ahead of delivery cut-off; defaults applied if no selection.

### F — Marketing website (planned)
- Public marketing/landing pages wrapping the subscription funnel.

---

## Tech stack

- **Monorepo:** Turborepo + pnpm workspaces (`pnpm@10.34.4`, pinned).
- **Apps:** Next.js 16 (App Router, Server Actions), TypeScript, React 19.
- **UI:** Tailwind v4 + shadcn/ui (radix base), shared via `@realm/ui` + `@realm/design-system`.
- **Auth:** better-auth (credentials + database sessions), wrapped by `@realm/auth`
  (`createRoleGuards` guard factory + bcrypt).
- **Data:** PostgreSQL + Drizzle ORM (`drizzle-kit` migrations + seed).
- **Testing:** Vitest — pure-logic/component tests + a live-seeded-Postgres harness.

### Shared packages (`@realm/*`)

Layered, acyclic, bottom-up. Full taxonomy in
[`docs/realm/repo-structure.md`](docs/realm/repo-structure.md).

| Package | Purpose |
|---|---|
| `@realm/commons` | Framework-agnostic core: DTOs, Condition DSL, errors, enums, money, logger |
| `@realm/commons-drizzle` | Drizzle repo + service base (managed-field stamping, actor hook) |
| `@realm/commons-next` | Next route factories, list-param parse, response + error mapper, `Text` |
| `@realm/commons-files` | S3/local/memory file storage (server-only) |
| `@realm/commons-notify` | SES email, react-email render (server-only) |
| `@realm/ui` | shadcn/radix primitives + `cn` |
| `@realm/design-system` | `ds/*` compositions over `@realm/ui` |
| `@realm/crm-core` | Slot-based `<CrmShell>` dashboard scaffold |
| `@realm/themes` | ThemeProvider/useTheme + no-flash script + tokens |
| `@realm/auth` | `createRoleGuards(getSession)` + bcrypt (server-only) |
| `@realm/eslint-config` | Shared Next ESLint presets (`tooling/`) |

**Client-consumed** packages ship raw `.ts`/`.tsx` (no build step) and must be listed in
`apps/<client>/next.config.ts` `transpilePackages`. **Server-only** packages
(`commons-files`, `commons-notify`, `auth`) are not transpiled.

### Entity convention

Every table carries `id`, `created_at`, and audit `created_by`; updatable tables add
`updated_at` (auto-stamped) and `updated_by`. Two composable column sets mirror the
immutable vs updatable base DTOs in `@realm/commons-drizzle`.

---

## Repository layout

```
realm/
├─ apps/
│  └─ tiffin-grab/             # first client app (Next.js 16)
├─ packages/                   # shared platform code — scope @realm/*
│  ├─ commons/  commons-drizzle/  commons-next/
│  ├─ commons-files/  commons-notify/
│  ├─ ui/  design-system/  crm-core/  themes/  auth/
├─ tooling/
│  └─ eslint-config/           # @realm/eslint-config
├─ docs/realm/                 # platform docs (structure, add-a-*, workflow)
├─ docs/superpowers/specs/     # design specs per slice
├─ turbo.json
├─ pnpm-workspace.yaml         # globs: apps/*, packages/*, tooling/*
└─ tsconfig.base.json
```

---

## Conventions

- TypeScript everywhere; no unnecessary comments (document the non-obvious *why* only).
- `rg`/`fd` over `grep`/`find` in tooling.
- Pricing is computed **server-side only** — the client never submits totals.
- Audit fields (`created_by` / `updated_by`) are stamped from the session, never trusted from input.
- Product surface + client-specific policy stay in `apps/<client>` until a second
  client proves something is genuinely shared — then it graduates to a `@realm/*` package.
- **Next.js 16 note:** route protection lives in `proxy.ts` (the renamed `middleware.ts`);
  see `AGENTS.md` — read `node_modules/next/dist/docs/` before writing framework code.
