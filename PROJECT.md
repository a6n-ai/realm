# Tiffin Grab

A CRM + subscription platform for a customizable tiffin (home-style meal) delivery
service operating in the Greater Toronto Area (GTA). Customers build and subscribe to
weekly meal plans through a guided wizard; admin and sales staff manage inquiries,
orders, catalog, users, roles, and per-user feature flags.

---

## Vision

One platform spanning three audiences, behind a single login:

- **Customers** subscribe to customizable tiffin plans (nutrition baseline → meal size →
  schedule → duration), receive weekly menus, and pick what they eat each day.
- **Sales staff** capture inquiries, move them through a follow-up pipeline to converted,
  and create orders on a customer's behalf.
- **Admins** control the product catalog, weekly menu releases, user roles, and
  per-user feature flags.

All meals are customizable. A weekly menu is released to subscribers, who then select
each meal for each day of their tiffin.

---

## Roles

A single Auth.js login serves all three role types (resolved at sign-in):

| Role | Who | Capabilities |
|------|-----|--------------|
| `admin`  | Operators | Manage users, roles, feature flags, catalog, weekly menus |
| `member` | Sales / staff agents | Inquiries pipeline, create orders for customers (subsystem D) |
| `user`   | Customers / subscribers | Run the subscription wizard, manage own subscription & menu picks |

---

## Subsystem map & roadmap

The product is decomposed into independently shippable subsystems. Each gets its own
spec → plan → implementation cycle.

| # | Subsystem | Status | Summary |
|---|-----------|--------|---------|
| **A** | Foundation | **MVP (slice 1)** | Monorepo, DB + Drizzle ORM, base-entity + repo/service stack, env, seed |
| **B** | Auth + RBAC + feature flags | **MVP (slice 1)** | Single Auth.js v5 login, roles, normalized per-user feature flags, admin grants |
| **C** | Subscription wizard + checkout | **MVP (slice 1)** | 4-step plan builder → 2-step checkout → activation + auto-provision |
| **D** | Inquiries CRM | Planned | Sales-agent inquiry pipeline (new → follow-up → converted), order creation, editable catalog admin |
| **E** | Weekly-menu engine | Planned | Release weekly menu, per-day per-tiffin meal selection (the customization core) |
| **F** | Marketing website | Planned | Public site revamp around the platform |

**Slice 1 (A+B+C)** is specified in
[`docs/superpowers/specs/2026-06-18-tiffin-grab-mvp-design.md`](docs/superpowers/specs/2026-06-18-tiffin-grab-mvp-design.md).

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

- **Monorepo:** Turborepo + pnpm workspaces.
- **App:** Next.js 16 (App Router, Server Actions), TypeScript, React 19.
- **UI:** Tailwind v4 + shadcn/ui (Nova preset, radix base); UI taste via the `impeccable` skill.
- **Auth:** Auth.js v5 (Credentials), database sessions via Drizzle adapter + credential→session bridge.
- **Data:** PostgreSQL + Drizzle ORM (`drizzle-kit` migrations + seed).
- **Testing:** Vitest (pricing engine, flag resolution, postal-zone matching).

### Reusable packages

Mirrors the layered `commons` / `commons-jooq` design from the reference jOOQ project:

- **`@tiffin/commons`** — DB-agnostic: base DTO types, structured condition/filter model
  (`AbstractCondition` / `FilterCondition` / `ComplexCondition` port), errors, enums, util.
- **`@tiffin/commons-drizzle`** — Drizzle persistence: `baseColumns` / `updatableColumns`,
  `BaseRepository` / `UpdatableRepository` (DAO tier), `BaseService` / `UpdatableService`,
  and a condition→Drizzle-`where` translator.

### Entity convention

Every table carries `id`, `created_at`, and audit `created_by`; updatable tables add
`updated_at` (auto-stamped) and `updated_by`. Two composable column sets mirror the
reference `AbstractDTO` (immutable) and `AbstractUpdatableDTO` (updatable) abstract classes.

---

## Repository layout

```
tiffin-grab/
├─ apps/
│  └─ web/                     # Next.js 16 app
├─ packages/
│  ├─ commons/                 # @tiffin/commons (DB-agnostic)
│  └─ commons-drizzle/         # @tiffin/commons-drizzle (Drizzle persistence)
├─ docs/superpowers/specs/     # design specs per slice
├─ turbo.json
├─ pnpm-workspace.yaml
└─ PROJECT.md
```

---

## Conventions

- TypeScript everywhere; no unnecessary comments (document the non-obvious *why* only).
- `rg`/`fd` over `grep`/`find` in tooling.
- Pricing is computed **server-side only** — the client never submits totals.
- Audit fields (`created_by` / `updated_by`) are stamped from the session, never trusted from input.
- **Next.js 16 note:** route protection lives in `proxy.ts` (the renamed `middleware.ts`);
  see `AGENTS.md` — read `node_modules/next/dist/docs/` before writing framework code.
