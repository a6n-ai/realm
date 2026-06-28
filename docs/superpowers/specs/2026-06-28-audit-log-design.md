# Audit Log — Design

**Date:** 2026-06-28
**Status:** Draft (approved for spec)
**Builds on:** `2026-06-22-commons-write-layer-audit-design.md` (createdBy/updatedBy/createdAt/updatedAt stamping)
**Related:** `2026-06-28-tiffin-wallet-design.md` (shares the `business_event` enum)

## Problem

We need a CRM-wide audit trail: for every mutation, capture **what** changed, **from → to**, **who** did it, and **when**. Coverage must span customer, sales, and admin actions. Row-level "who/when" already exists (`createdBy`/`updatedBy` via `baseColumns`/`updatableColumns`); this adds the **history** and **field-level diff** on top, plus sensitive-read and auth-event logging.

## What already exists (do not rebuild)

- **`audit_log` table** (`apps/web/db/schema/audit.ts`) — `baseColumns("aud")` (so `createdBy` = actor, `createdAt` = when), `entity` text, `entityPublicId` text, `operation` enum, `changes` jsonb. **Currently dead — nothing writes to it.**
- **`audit_operation` enum** — `create | update | delete`.
- **Actor plumbing** — `BaseRepository.create`/`updateByPublicId` already receive `actorId` from `BaseService.currentUserId()`. Three services override `currentUserId` (`session-service`, `inquiries.service`).
- **Managed fields** — `stripManaged`/`stripCreateOnly` guard reserved columns.

## Scope

Three capture paths (all requested):

| Path | Trigger | Mechanism |
|------|---------|-----------|
| Writes + diff | create / update / delete on any entity | `BaseRepository` choke point (automatic for every service) |
| Sensitive reads | read of flagged entities (PII, payments) | per-repo opt-in flag on `findByPublicId` |
| Auth events | login / logout / failed login | explicit calls in auth flow (not via repo) |

## Architecture

### 1. Layering boundary: `AuditWriter` interface

`commons-drizzle` is generic and **must not import** `apps/web` schema (`audit_log` lives in the app). So:

- **`commons-drizzle`** defines the interface and wires the calls:
  ```ts
  export interface AuditWriter {
    record(entry: {
      entity: string;
      entityPublicId: string;
      operation: "create" | "update" | "delete" | "read";
      changes?: unknown;          // {field: {from, to}} for update; full values for create; null for read/delete
      actorId: bigint | null;
    }): Promise<void>;
  }
  ```
- **`apps/web`** supplies `DrizzleAuditWriter` — inserts into `audit_log` using the same `db`.

`BaseRepository` gains an optional constructor arg `audit?: AuditWriter` and an optional `sensitive?: boolean`. When `audit` is absent the repo behaves exactly as today (audit is opt-in; tests/scripts pass nothing).

### 2. Write capture (in `BaseRepository`)

- **create**: after insert, `audit.record({ entity: tableName, entityPublicId: row.publicId, operation: "create", changes: <inserted values, managed stripped>, actorId })`.
- **update**: `updateByPublicId` currently does **not** read the prior row. Add a before-read inside the same call, compute a shallow diff of changed columns only → `changes = {field: {from, to}}`, then `record(operation: "update")`. Skip the audit row if the diff is empty.
- **delete**: `record(operation: "delete", changes: null)` (capture the publicId being deleted).

The audit insert runs on the same `db` handle as the mutation. If/when the write path adopts transactions, the audit insert joins the transaction; until then it is a best-effort follow-on insert — a failed audit insert must **not** roll back the business write (log and continue).

> **ponytail:** one extra `SELECT` per update buys the diff. Acceptable at CRM scale; revisit only if update throughput becomes a measured problem.

### 3. Sensitive-read capture

- `BaseRepository` constructor flag `sensitive?: boolean` (default false).
- When `sensitive && audit`, `findByPublicId` records `operation: "read"`, `changes: null`.
- Only flag repos that need it (customers/users, payments). Everything else stays unlogged — keeps volume sane.
- **Enum change:** add `read` to `audit_operation`.

### 4. Auth-event capture

- Auth flows (login, logout, failed PIN/login) don't pass through `BaseRepository`. Add explicit `auditWriter.record(...)` calls at those call sites with `entity: "auth"`, `entityPublicId: <user publicId or attempted identifier>`.
- **Enum change:** add `login`, `logout`, `login_failed` to `audit_operation` (one enum, kept generic). Final enum:
  `create | update | delete | read | login | logout | login_failed`.
- `changes` for auth carries minimal context (e.g. `{ method, ip? }`) — **never** credentials.

## Data flow

```
Service.update(publicId, patch)
  └─ currentUserId()  → actorId
  └─ Repo.updateByPublicId(publicId, patch, actorId)
       ├─ before = findByPublicId(publicId)
       ├─ row    = UPDATE ... RETURNING
       ├─ diff   = changedFields(before, row)
       └─ audit.record({entity, entityPublicId, operation:"update", changes:diff, actorId})
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

- Repo unit tests (live-DB harness): create writes a `create` row with values; update writes `update` with correct `{from,to}`; no-op update writes nothing; delete writes `delete`.
- Sensitive flag: `findByPublicId` on a flagged repo writes `read`; unflagged writes nothing.
- Auth: login/logout/failed each write the right operation with no credential leakage.
- Layering: `commons-drizzle` has zero import of `apps/web`.

## Out of scope

- Audit log viewer UI (read-back/reporting) — separate spec.
- Retention/archival policy.
- Tamper-proofing / append-only enforcement at the DB level.

## Open items

- Decide the exact set of `sensitive: true` repos (start: users/customers, payments).
- Confirm auth call sites from `2026-06-23-auth-phaseC-pin-design.md`.
