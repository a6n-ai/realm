# Audit Log — Design

**Date:** 2026-06-28
**Status:** Draft (approved for spec)
**Builds on:** `2026-06-22-commons-write-layer-audit-design.md` (createdBy/updatedBy/createdAt/updatedAt stamping)
**Related:** `2026-06-28-tiffin-wallet-design.md` (shares the `business_event` enum)

## Problem

We need a CRM-wide audit trail: for every mutation, capture **what** changed, **from → to**, **who** did it, and **when**. Coverage must span customer, sales, and admin actions. Row-level "who/when" already exists (`createdBy`/`updatedBy` via `baseColumns`/`updatableColumns`); this adds the **history** and **field-level diff** on top, plus sensitive-read and auth-event logging.

## What already exists (do not rebuild)

**Audit writes are already wired — at the service layer, not the repo.** `apps/web/lib/services/session-service.ts` does the work:

- **`audit_log` table** (`apps/web/db/schema/audit.ts`) — `baseColumns("aud")` (`createdBy` = actor, `createdAt` = when), `entity`, `entityPublicId`, `operation` enum, `changes` jsonb.
- **`audit_operation` enum** — `create | update | delete`.
- **`recordAudit(entry)`** — best-effort insert into `audit_log`; swallows failures (never breaks the caller); `jsonSafe` coerces bigints so jsonb never throws on FK ids.
- **`SessionBaseService` / `SessionUpdatableService`** — already override `create`/`update`/`delete` to call `recordAudit`, resolve the actor via `sessionActorId()`, and stamp `createdBy`/`updatedBy`. Catalog, inquiries, etc. extend these.
- **`auditChanges(patch)`** — overridable hook on `SessionUpdatableService`; today returns `stripManaged(patch)` (new values only).

**This means writes + actor + when are DONE.** The remaining gaps are the only work:

1. **Field-level diff** — `changes` stores new values, not `{from, to}`. Needs a before-read in `update`.
2. **Sensitive reads** — not captured.
3. **Auth events** — not captured.

## Scope

Three capture paths (all requested):

| Path | Trigger | Mechanism |
|------|---------|-----------|
| Writes + diff | create / update / delete on any entity | `BaseRepository` choke point (automatic for every service) |
| Sensitive reads | read of flagged entities (PII, payments) | per-repo opt-in flag on `findByPublicId` |
| Auth events | login / logout / failed login | explicit calls in auth flow (not via repo) |

## Architecture

All changes live in `apps/web/lib/services/session-service.ts` (plus the enum and auth call sites). **No `commons-drizzle` change** — audit is already service-layer. Keep it there.

### 0. Enum extension (`audit.ts`)

Widen `audit_operation` to:
`create | update | delete | read | login | logout | login_failed`.
Widen the `AuditEntry.operation` union in `session-service.ts` to match.

### 1. Field-level diff on update

`SessionUpdatableService.update` currently stamps `changes = stripManaged(patch)` (new values only). Change it to capture `{from, to}`:

- Before calling `super.update`, read the prior row: `const before = await this.repo.findByPublicId(publicId)`.
- After the update returns `row` (the after-state), compute the diff over the patched keys only:
  `diff[field] = { from: before[field], to: row[field] }` for each key in `stripManaged(patch)` where `before[field] !== row[field]`.
- If `diff` is empty, **skip** the audit row (no-op update).
- Replace the `auditChanges(patch)` call with this before/after diff. Keep `auditChanges` overridable but redefine its signature to `auditChanges(before, after, patch)` so subclasses (e.g. catalog soft-delete) can still shape it.

> **ponytail:** one extra `findByPublicId` per update buys the diff. Acceptable at CRM scale; revisit only if update throughput is a measured problem.

### 2. Sensitive-read capture

- Add an optional `protected sensitive = false` field to `SessionBaseService`.
- Override `read(publicId)` in `SessionBaseService`: call `super.read`, and if `this.sensitive`, `recordAudit({ operation: "read", changes: null, ... })`.
- Subclasses that hold PII/payments set `sensitive = true` (users/customers, payments). Everything else stays unlogged — keeps volume sane.

### 3. Auth-event capture

- Auth flows (login, logout, failed PIN/login) don't go through a service. Add explicit `recordAudit(...)` calls at those call sites with `entity: "auth"`, `entityPublicId: <user publicId or attempted identifier>`, `operation: login | logout | login_failed`.
- `changes` carries minimal context (e.g. `{ method }`) — **never** credentials.

## Data flow

```
SessionUpdatableService.update(publicId, patch)
  ├─ actorId = currentUserId()
  ├─ before  = repo.findByPublicId(publicId)
  ├─ row     = super.update(publicId, {...patch, updatedBy: actorId})   // after-state
  ├─ diff    = changedFields(before, row, patch)   // {field:{from,to}}
  └─ if diff non-empty: recordAudit({entity, entityPublicId, operation:"update", changes:diff, createdBy:actorId})
```

## Diff format (`changes` jsonb)

- create → `{ <field>: <value>, ... }` (managed fields stripped)
- update → `{ <field>: { from, to }, ... }` (changed fields only)
- delete / read → `null`
- auth → `{ method, ... }` (no secrets)

## Error handling

- Audit insert failure logs an error and is swallowed — never breaks the business operation or auth flow.
- Empty update diff → no audit row.
- No session (tests/scripts) → `actorId = null`, still records.

## Testing

- Service tests (live-DB harness): update writes `update` with correct `{from,to}` for changed fields only; no-op update (patch equals current) writes nothing; create still writes `create`; delete still writes `delete`.
- Sensitive flag: `read` on a `sensitive = true` service writes a `read` row; a normal service writes nothing on read.
- Auth: login/logout/failed each write the right operation with no credential leakage.

## Out of scope

- Audit log viewer UI (read-back/reporting) — separate spec.
- Retention/archival policy.
- Tamper-proofing / append-only enforcement at the DB level.

## Open items

- Decide the exact set of `sensitive: true` repos (start: users/customers, payments).
- Confirm auth call sites from `2026-06-23-auth-phaseC-pin-design.md`.
