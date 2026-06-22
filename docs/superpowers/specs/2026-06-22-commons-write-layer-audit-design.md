# Slice 5 — Intermediate Service Layer + Persistent Audit Log

**Date:** 2026-06-22
**Status:** Approved, pre-implementation

## Summary

Establish a single intermediate service layer between the generic commons write abstractions and the concrete domain services, and use it to add a persistent audit trail for every entity write across the CRM. The goal is architectural: a cross-cutting write concern (today: audit logging; tomorrow: events, metrics) is added **once** in the middle layer and inherited by every service — never copied into N services.

This also retrofits the services that still write raw SQL (`menu`, `inquiries` activities, `app-settings`) so they flow through the intermediate and therefore get audited automatically.

## Motivation

When the CRM needs a logging/audit capability, we don't want to touch every service. By routing all writes through one intermediate base class whose `create`/`update`/`delete` wrap `super`, a new cross-cutting concern lands in one place. This slice proves the seam by wiring a real persistent audit log into it.

## Architecture: the three-layer write stack

```
@tiffin/commons-drizzle
  BaseService / UpdatableService        ← generic write + managed-column stamping
        ▲ extends
apps/web/lib/services/session-service.ts
  SessionBaseService / SessionUpdatableService   ← APP INTERMEDIATE: session actor + AUDIT SEAM
        ▲ extends
concrete services (orders, inquiries, menu, app-settings, catalog, dishes, users, …)
```

**Rules (the enforceable convention):**
1. Every concrete service extends `SessionBaseService` / `SessionUpdatableService` (the intermediate), never commons directly.
2. Any `create` / `update` / `delete` override does its custom work then calls `super.create(...)` / `super.update(...)` / `super.delete(...)` — never re-implements the write.
3. `Session*Service` is the single documented seam for cross-cutting write concerns. Audit logging lives there now; future concerns (events, metrics) go there too.

The intermediate must stay in `apps/web` (not commons) because it depends on app auth (`@/lib/auth`) and the `users` table. The generic mechanics stay in commons.

## Data model

New file `apps/web/db/schema/audit.ts` + hand-written migration `0008_audit_log.sql` (drizzle-kit generate needs a TTY here — hand-author SQL + `meta/_journal.json` entry, per known project debt; do NOT rebaseline).

```
auditOperation = pgEnum("audit_operation", ["create", "update", "delete"])

audit_log (baseColumns("aud") = id, public_id, created_at, created_by):
  entity          text   not null   -- drizzle table name, e.g. "orders"
  entity_public_id text  not null   -- affected row's public_id
  operation       audit_operation not null
  changes         jsonb             -- values written (managed fields stripped); null for delete
```

- `created_by` carries the actor (resolved from the session by the intermediate) — no separate `actor_id` column.
- No FK from `audit_log` to entity tables (entity referenced by text name + public_id), so deletes of audited rows don't cascade and the log is durable.

## Audit hook in the intermediate (`session-service.ts`)

`SessionBaseService` and `SessionUpdatableService` override the commons write methods:

- `create(values)`: `const row = await super.create(values)`; then write an audit row `{ entity: tableName, entityPublicId: row.publicId, operation: "create", changes: stripManaged(values), createdBy: await currentUserId() }`; return `row`.
- `delete(publicId)`: read nothing extra — `const n = await super.delete(publicId)`; audit `{ operation: "delete", entityPublicId: publicId, changes: null }`; return `n`.
- `update(publicId, patch)` (UpdatableService): `const row = await super.update(publicId, patch)`; audit `{ operation: "update", entityPublicId: row.publicId, changes: stripManaged(patch) }`; return `row`.

**Audit write properties:**
- It is a **raw `db.insert(auditLog)`** — the logger cannot log through the audited path (infinite recursion); this is the one justified raw-write exception in the intermediate.
- It is **best-effort**: wrapped in `try/catch`; on failure it `console.error`s and swallows, so an audit hiccup never breaks the user's operation. (A durable-but-non-blocking trail; we accept rare gaps over breaking writes.)
- `changes` stores the **full written values** (create) or the **full patch** (update), with managed fields (`id`, `publicId`, `createdAt`, `createdBy`, `updatedAt`, `updatedBy`) stripped via the existing `stripManaged` helper.
- Table name comes from drizzle's `getTableName(table)`. `BaseRepository` exposes a `get tableName(): string` getter (the only commons addition) so the intermediate can read it without reaching into repo internals.

## commons-drizzle changes

Only one addition: `BaseRepository` gains `get tableName(): string { return getTableName(this.table); }` (import `getTableName` from `drizzle-orm`). No bulk methods, no singleton helpers — explicitly out of scope.

## Service retrofits

### `menu.service.ts` → two-entity facade
Replace the object literal with a facade delegating to:
- `class MenuWeeksService extends SessionUpdatableService<typeof menuWeeks>` — `upsertWeek` (find by `weekStart`; if present `this.update(publicId, { orderCutoff })`, else `this.create({ weekStart, orderCutoff })`); `release` (`this.update(publicId, { status: "released", releasedAt })`).
- `class MenuItemsService extends SessionBaseService<typeof menuItems>` — `addItem` overrides `create`: resolve slot/week/dish FKs and enforce the enabled-slot check, then call `super.create(...)` (preserve the `onConflictDoNothing` semantics — see note); `removeItem` → `this.delete(publicId)`.
- `weekWithItems` — read, unchanged.
- `setDefault` — **stays a documented raw `db.update`** (bulk update by composite key; no commons bulk method per decision). It is NOT audited; documented inline.

Note on `addItem` conflict handling: `super.create` (commons `BaseRepository.create`) does a plain insert without `onConflictDoNothing`. To preserve the existing idempotent behavior, `MenuItemsService.addItem` checks for an existing item on the composite key before calling `super.create`, returning the existing/`null` as today — keeping conflict handling in the override rather than pushing an `onConflict` option into commons.

### `inquiries.service.ts`
Already extends `SessionUpdatableService<typeof inquiries>`. Replace the 5 raw `db.insert(inquiryActivities)` calls with a composed `SessionBaseService` over `inquiryActivities` (`this.activities.create({...})`), mirroring orders. Activity rows are now audited automatically.

### `app-settings.service.ts`
Introduce `class AppSettingsService extends SessionUpdatableService<typeof appSettings>`. `setAppSettings` finds the singleton row; if present `this.update(publicId, patch)`, else `this.create(patch)`. `getAppSettings` stays a plain read. Singleton write is now audited.

## Known exceptions (documented, not audited)

- `createOrder` (`orders.service.ts`) — bespoke multi-table pricing/provisioning/payment in one transaction; legitimately raw, not routed through a service.
- `menu.setDefault` — raw bulk update by composite key (no bulk commons method this slice).

These get a one-line justification comment where they live.

## Testing

- **Audit (new, TDD):** `create`/`update`/`delete` through a `SessionBaseService`/`SessionUpdatableService` each write one `audit_log` row with the correct `entity`, `entityPublicId`, `operation`, and `changes`; a forced audit-insert failure does NOT throw (best-effort). Use an existing audited table (e.g. drive through `inquiriesService` or a small test harness service).
- **Retrofit services:** existing `inquiries`/`app-settings` tests keep passing; add a focused `menu.service` test (upsertWeek create+update, addItem idempotent, removeItem, setDefault) since none exists today.
- Test `reset()` helpers also `db.delete(auditLog)` so rows don't accumulate across runs (no FK, so order doesn't matter).
- Run from `apps/web` with `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin"` prefix; session-importing tests `vi.mock("@/lib/auth", () => ({ auth: async () => null }))` + dynamic import. Tests wipe the dev DB — reseed after the full run.

## Process

superpowers `writing-plans` → `subagent-driven-development` (fresh implementer + task-reviewer per task) → final whole-branch review → `merge --no-ff` to main + push + delete branch. Plain commits, no `Co-Authored-By`. Hand-author migration 0008 + journal entry. Read `node_modules/next/dist/docs/` before any framework code.

## Tech-decision alignment

- **TD-1** shared code → commons: the generic write mechanics stay in `@tiffin/commons-drizzle` (`tableName` getter added there); the app-specific intermediate (session + audit) stays in `apps/web` because it depends on app auth. See [[commons-packages-convention]].
- Convention recorded in memory `services-extend-commons-convention`.
- Known migration-snapshot debt (0003–0007 lack snapshot JSON) continues; 0008 hand-authored the same way.
