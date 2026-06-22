# Intermediate Service Layer + Persistent Audit Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every entity write through the app's intermediate service layer (`SessionBaseService`/`SessionUpdatableService`) and make that layer write a persistent `audit_log` row for each create/update/delete — so cross-cutting write concerns live in one place, inherited by all services.

**Architecture:** Three-layer write stack: `@tiffin/commons-drizzle` `BaseService`/`UpdatableService` (generic write + managed-column stamping) → `apps/web` `SessionBaseService`/`SessionUpdatableService` (session actor + **audit seam**) → concrete services. The intermediate's `create`/`update`/`delete` call `super` then best-effort-record an audit row. Services that still write raw SQL (`menu`, `inquiries` activities, `app-settings`) are retrofitted to flow through the intermediate.

**Tech Stack:** Next.js 16 (modified — read `node_modules/next/dist/docs/` before framework code), Drizzle ORM + Postgres, vitest, TypeScript, pnpm monorepo (`@tiffin/commons`, `@tiffin/commons-drizzle`, `apps/web`).

## Global Constraints

- Layering rule: every concrete service extends `SessionBaseService`/`SessionUpdatableService`, never commons directly; every `create`/`update`/`delete` override calls `super.*` and never re-implements the write.
- The audit write is a raw `db.insert(auditLog)` (the logger can't log through the audited path) and is **best-effort**: wrapped in try/catch, `console.error` on failure, never throws into the caller.
- `changes` jsonb stores the full written values (create) or full patch (update) with managed fields stripped via `stripManaged`; null for delete.
- Only commons-drizzle addition this slice: `BaseRepository.tableName` getter. NO bulk-update / singleton / onConflict helpers.
- Documented raw exceptions (NOT audited): `createOrder` (multi-table tx), `menu.setDefault` (composite-key bulk update).
- drizzle-kit generate needs a TTY here — hand-author migration SQL + `meta/_journal.json` entry (idx 8, tag `0008_audit_log`). Do NOT rebaseline. `db:migrate` works via the journal.
- Tests run from `apps/web` prefixed `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin"`; commons tests run from `packages/commons-drizzle` (or repo root turbo). Session-importing tests `vi.mock("@/lib/auth", () => ({ auth: async () => null }))` + dynamic `await import(...)`. Tests wipe the dev DB — reseed after the full run: `pnpm db:seed && db:seed:catalog && db:seed:menu && db:seed:admin`.
- `next-id.test.ts` is a known flake under full-suite load — if ONLY it fails, the gate is green.
- Terminology: "order" not "subscription". Plain commits, NO `Co-Authored-By` trailer.

---

### Task 1: `BaseRepository.tableName` getter (commons-drizzle, TDD)

**Files:**
- Modify: `packages/commons-drizzle/src/repository.ts`
- Test: `packages/commons-drizzle/src/repository.test.ts`

**Interfaces:**
- Produces: `BaseRepository<TTable>` gains `get tableName(): string` returning drizzle's `getTableName(this.table)`.

- [ ] **Step 1: Write the failing test**

Append to `packages/commons-drizzle/src/repository.test.ts` (match the existing test's table-construction style — read the file first to reuse its fixture table; if it builds a `pgTable`, reuse it):

```typescript
import { getTableName } from "drizzle-orm";
// ... within an existing describe, or a new one:
it("exposes the underlying table name", () => {
  // reuse the fixture table + db the other tests construct; e.g.:
  const repo = new BaseRepository(testDb, testTable, testTable.publicId, testTable.id);
  expect(repo.tableName).toBe(getTableName(testTable));
});
```

(If `repository.test.ts` has no reusable fixture, construct a minimal `pgTable("widgets", { ...baseColumns("wdg") })` and a stub `db`; the getter doesn't touch the db, so any value works for the `db` arg.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/commons-drizzle && pnpm vitest run src/repository.test.ts`
Expected: FAIL — `repo.tableName` is undefined / not a function.

- [ ] **Step 3: Implement the getter**

In `packages/commons-drizzle/src/repository.ts`, add `getTableName` to the drizzle import and a getter on `BaseRepository`:

```typescript
import { asc, desc, eq, getTableName, sql } from "drizzle-orm";
```

Inside `class BaseRepository`, after the constructor:

```typescript
  get tableName(): string {
    return getTableName(this.table);
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/commons-drizzle && pnpm vitest run src/repository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/commons-drizzle/src/repository.ts packages/commons-drizzle/src/repository.test.ts
git commit -m "feat(commons-drizzle): expose BaseRepository.tableName getter"
```

---

### Task 2: `audit_log` schema + migration 0008

**Files:**
- Create: `apps/web/db/schema/audit.ts`
- Modify: `apps/web/db/schema/index.ts`
- Create: `apps/web/db/migrations/0008_audit_log.sql`
- Modify: `apps/web/db/migrations/meta/_journal.json`

**Interfaces:**
- Produces: `auditOperation` pgEnum, `auditLog` table exported from `@/db/schema`.

- [ ] **Step 1: Create the schema file**

Create `apps/web/db/schema/audit.ts`:

```typescript
import { baseColumns } from "@tiffin/commons-drizzle";
import { jsonb, pgEnum, pgTable, text } from "drizzle-orm/pg-core";

export const auditOperation = pgEnum("audit_operation", ["create", "update", "delete"]);

export const auditLog = pgTable("audit_log", {
  ...baseColumns("aud"),
  entity: text("entity").notNull(),
  entityPublicId: text("entity_public_id").notNull(),
  operation: auditOperation("operation").notNull(),
  changes: jsonb("changes"),
});
```

- [ ] **Step 2: Export from the schema barrel**

In `apps/web/db/schema/index.ts`, add at the end:

```typescript
export * from "./audit";
```

- [ ] **Step 3: Hand-write the migration**

Create `apps/web/db/migrations/0008_audit_log.sql`:

```sql
CREATE TYPE "audit_operation" AS ENUM('create', 'update', 'delete');
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"entity" text NOT NULL,
	"entity_public_id" text NOT NULL,
	"operation" "audit_operation" NOT NULL,
	"changes" jsonb,
	CONSTRAINT "audit_log_public_id_unique" UNIQUE("public_id")
);
```

(Column set = `baseColumns("aud")` = id/public_id/created_at/created_by, then the four audit columns. No FK — entity is referenced by text name + public_id.)

- [ ] **Step 4: Add the journal entry**

In `apps/web/db/migrations/meta/_journal.json`, append after the `0007_order_management` entry (idx 7):

```json
    {
      "idx": 8,
      "version": "7",
      "when": 1782500000000,
      "tag": "0008_audit_log",
      "breakpoints": true
    }
```

(Add a comma after the idx-7 entry's closing brace.)

- [ ] **Step 5: Run the migration + verify**

Run: `cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:migrate`
Expected: applies `0008_audit_log` without error.

Then verify the table exists (psql may be unavailable — if so, a one-off tsx/node query or the drizzle introspection works; the migrate success + journal entry is the primary signal):

```bash
cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" node -e "const {Client}=require('pg');(async()=>{const c=new Client();await c.connect();const r=await c.query(\"select column_name from information_schema.columns where table_name='audit_log' order by ordinal_position\");console.log(r.rows.map(x=>x.column_name).join(','));await c.end();})()" 2>/dev/null || echo "verify manually: audit_log has id,public_id,created_at,created_by,entity,entity_public_id,operation,changes"
```
Expected: columns `id,public_id,created_at,created_by,entity,entity_public_id,operation,changes`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/db/schema/audit.ts apps/web/db/schema/index.ts apps/web/db/migrations/0008_audit_log.sql apps/web/db/migrations/meta/_journal.json
git commit -m "feat(audit): add audit_log table + audit_operation enum (migration 0008)"
```

---

### Task 3: Audit hook in the intermediate service layer (TDD)

**Files:**
- Modify: `apps/web/lib/services/session-service.ts`
- Test: `apps/web/lib/services/__tests__/audit.service.test.ts` (create)

**Interfaces:**
- Consumes: `auditLog` from `@/db/schema`; `stripManaged` from `@tiffin/commons-drizzle`; `BaseRepository.tableName` (Task 1).
- Produces: `SessionBaseService.create`/`delete` and `SessionUpdatableService.update` now write an `audit_log` row via an exported best-effort `recordAudit(entry)`. `recordAudit(entry: { entity: string; entityPublicId: string; operation: "create"|"update"|"delete"; changes: Record<string, unknown> | null; createdBy: bigint | null }): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/lib/services/__tests__/audit.service.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { auditLog, inquiries, inquiryActivities } = await import("@/db/schema");
const { inquiriesService } = await import("../inquiries.service");
const { recordAudit } = await import("../session-service");

async function reset() {
  await db.delete(auditLog);
  await db.delete(inquiryActivities);
  await db.delete(inquiries);
}

describe("audit logging via the intermediate layer (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("writes a create audit row when a service creates an entity", async () => {
    const inq = await inquiriesService.create({ fullName: "Aud Test", phone: "+16475550000", source: "manual" });
    const rows = await db.select().from(auditLog).where(eq(auditLog.entityPublicId, inq.publicId));
    const created = rows.find((r) => r.operation === "create");
    expect(created).toBeTruthy();
    expect(created!.entity).toBe("inquiries");
    expect((created!.changes as Record<string, unknown>).fullName).toBe("Aud Test");
  });

  it("writes an update audit row when a service updates an entity", async () => {
    const inq = await inquiriesService.create({ fullName: "Up Test", phone: "+16475550001", source: "manual" });
    await db.delete(auditLog);
    await inquiriesService.changeStage(inq.publicId, "contacted");
    const updates = await db.select().from(auditLog)
      .where(eq(auditLog.entityPublicId, inq.publicId));
    expect(updates.some((r) => r.operation === "update")).toBe(true);
  });

  it("recordAudit is best-effort: a failing insert does not throw", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    // entity violates NOT NULL → insert fails → must be swallowed.
    await expect(
      recordAudit({ entity: null as unknown as string, entityPublicId: "x", operation: "create", changes: null, createdBy: null }),
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/services/__tests__/audit.service.test.ts`
Expected: FAIL — `recordAudit` not exported / no audit rows written.

- [ ] **Step 3: Implement the audit hook**

Replace the contents of `apps/web/lib/services/session-service.ts` with (preserving the existing `sessionActorId` logic):

```typescript
import { BaseService, UpdatableService, stripManaged } from "@tiffin/commons-drizzle";
import { eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { auditLog, users } from "@/db/schema";

// session.user.id is the acting user's public_id (usr_…); audit columns are
// bigint. Resolve the public_id → users internal bigint once per call so the
// service stamps createdBy/updatedBy with the internal id (null if no session).
async function sessionActorId(): Promise<bigint | null> {
  try {
    const session = await auth();
    const publicId = session?.user?.id;
    if (!publicId) return null;
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1);
    return row?.id ?? null;
  } catch {
    // No request context (e.g. tests/scripts) → no actor to stamp.
    return null;
  }
}

export type AuditEntry = {
  entity: string;
  entityPublicId: string;
  operation: "create" | "update" | "delete";
  changes: Record<string, unknown> | null;
  createdBy: bigint | null;
};

// Best-effort persistent audit write. Raw insert (the logger cannot log through
// the audited service path), wrapped so an audit failure never breaks the
// caller's operation.
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLog).values({
      entity: entry.entity,
      entityPublicId: entry.entityPublicId,
      operation: entry.operation,
      changes: entry.changes,
      createdBy: entry.createdBy,
    });
  } catch (err) {
    console.error("audit log write failed", err);
  }
}

export class SessionBaseService<TTable extends PgTable> extends BaseService<TTable> {
  protected currentUserId(): Promise<bigint | null> {
    return sessionActorId();
  }

  async create(values: Record<string, unknown>): Promise<TTable["$inferSelect"]> {
    const row = await super.create(values);
    await recordAudit({
      entity: this.repo.tableName,
      entityPublicId: (row as { publicId: string }).publicId,
      operation: "create",
      changes: stripManaged(values),
      createdBy: await this.currentUserId(),
    });
    return row;
  }

  async delete(publicId: string): Promise<number> {
    const n = await super.delete(publicId);
    await recordAudit({
      entity: this.repo.tableName,
      entityPublicId: publicId,
      operation: "delete",
      changes: null,
      createdBy: await this.currentUserId(),
    });
    return n;
  }
}

export class SessionUpdatableService<TTable extends PgTable> extends UpdatableService<TTable> {
  protected currentUserId(): Promise<bigint | null> {
    return sessionActorId();
  }

  async create(values: Record<string, unknown>): Promise<TTable["$inferSelect"]> {
    const row = await super.create(values);
    await recordAudit({
      entity: this.repo.tableName,
      entityPublicId: (row as { publicId: string }).publicId,
      operation: "create",
      changes: stripManaged(values),
      createdBy: await this.currentUserId(),
    });
    return row;
  }

  async update(publicId: string, patch: Record<string, unknown>): Promise<TTable["$inferSelect"]> {
    const row = await super.update(publicId, patch);
    await recordAudit({
      entity: this.repo.tableName,
      entityPublicId: (row as { publicId: string }).publicId,
      operation: "update",
      changes: stripManaged(patch),
      createdBy: await this.currentUserId(),
    });
    return row;
  }

  async delete(publicId: string): Promise<number> {
    const n = await super.delete(publicId);
    await recordAudit({
      entity: this.repo.tableName,
      entityPublicId: publicId,
      operation: "delete",
      changes: null,
      createdBy: await this.currentUserId(),
    });
    return n;
  }
}
```

Notes for the implementer:
- `this.repo` is `protected` on `BaseService`/`UpdatableService` (constructor `protected readonly repo`), so the subclass can read `this.repo.tableName`. Confirm visibility against `packages/commons-drizzle/src/service.ts`; if `repo` is private, add a `protected get auditTableName()` to the commons services instead and use it — but it is `protected readonly`, so direct access works.
- `stripManaged` is exported from `@tiffin/commons-drizzle` (via `managed-fields`).
- `SessionUpdatableService` duplicates `create`/`delete` because it extends `UpdatableService` (not `SessionBaseService`). That duplication is acceptable (two short overrides); do NOT restructure the commons class hierarchy this slice.

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/services/__tests__/audit.service.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Confirm no regression in dependent service tests + typecheck**

Run:
```bash
cd apps/web && pnpm typecheck && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/services/__tests__/orders-lifecycle.service.test.ts lib/services/__tests__/inquiries-convert.test.ts
```
Expected: typecheck clean; tests pass (audit rows are additive; these tests don't assert audit-table counts).

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/services/session-service.ts apps/web/lib/services/__tests__/audit.service.test.ts
git commit -m "feat(audit): record audit_log rows from the intermediate service layer (best-effort)"
```

---

### Task 4: Retrofit `menu.service.ts` to the intermediate layer (TDD)

**Files:**
- Modify: `apps/web/lib/services/menu.service.ts`
- Test: `apps/web/lib/services/__tests__/menu.service.test.ts` (create)

**Interfaces:**
- Consumes: `SessionUpdatableService`, `SessionBaseService` from `./session-service`; `UpdatableRepository`, `BaseRepository` from `@tiffin/commons-drizzle`.
- Produces: `menuService` keeps the SAME public method names/signatures (`upsertWeek`, `addItem`, `removeItem`, `setDefault`, `release`, `weekWithItems`) — callers (`menu` admin pages, `meals` grid) are unchanged.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/services/__tests__/menu.service.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { auditLog, dishes, mealSlots, menuItems, menuWeeks } = await import("@/db/schema");
const { menuService } = await import("../menu.service");

async function reset() {
  await db.delete(auditLog);
  await db.delete(menuItems);
  await db.delete(menuWeeks);
  await db.delete(dishes);
  await db.delete(mealSlots);
}

describe("menuService (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("upsertWeek creates then updates a week", async () => {
    const w = await menuService.upsertWeek({ weekStart: "2099-01-05", orderCutoff: "2099-01-04T18:00:00Z" });
    expect(w.weekStart).toBe("2099-01-05");
    const again = await menuService.upsertWeek({ weekStart: "2099-01-05", orderCutoff: "2099-01-03T18:00:00Z" });
    expect(again.publicId).toBe(w.publicId);
    expect(again.orderCutoff).toBe(new Date("2099-01-03T18:00:00Z").getTime());
  });

  it("addItem inserts and is idempotent on the composite key; removeItem deletes", async () => {
    await db.insert(mealSlots).values({ key: "lunch", label: "Lunch", enabled: true });
    const [d] = await db.insert(dishes).values({ name: "Test Dish", diet: "veg", slots: ["lunch"] }).returning();
    const w = await menuService.upsertWeek({ weekStart: "2099-01-12", orderCutoff: "2099-01-11T18:00:00Z" });
    const item = await menuService.addItem({ menuWeekId: w.publicId, dayOfWeek: "mon", slot: "lunch", dishId: d.publicId, isDefault: true });
    expect(item).toBeTruthy();
    const dup = await menuService.addItem({ menuWeekId: w.publicId, dayOfWeek: "mon", slot: "lunch", dishId: d.publicId, isDefault: true });
    expect(dup).toBeNull(); // idempotent: already exists
    await menuService.removeItem(item!.publicId);
    const remaining = await db.select().from(menuItems).where(eq(menuItems.menuWeekId, (await db.select({ id: menuWeeks.id }).from(menuWeeks).where(eq(menuWeeks.publicId, w.publicId)))[0].id));
    expect(remaining).toHaveLength(0);
  });

  it("entity writes produce audit rows", async () => {
    const w = await menuService.upsertWeek({ weekStart: "2099-02-02", orderCutoff: "2099-02-01T18:00:00Z" });
    const rows = await db.select().from(auditLog).where(eq(auditLog.entityPublicId, w.publicId));
    expect(rows.some((r) => r.entity === "menu_weeks" && r.operation === "create")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/services/__tests__/menu.service.test.ts`
Expected: FAIL initially only if behavior differs — it likely PASSES against the current raw impl EXCEPT the audit-rows test (raw writes don't audit). Confirm the audit test fails (RED for the new behavior).

- [ ] **Step 3: Refactor `menu.service.ts`**

Rewrite `apps/web/lib/services/menu.service.ts` as a facade over two intermediate-backed entity services. Preserve all method signatures and the FK-resolution + enabled-slot checks:

```typescript
import { ValidationError } from "@tiffin/commons";
import { BaseRepository, UpdatableRepository } from "@tiffin/commons-drizzle";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, mealSlots, menuItems, menuWeeks } from "@/db/schema";
import { SessionBaseService, SessionUpdatableService } from "./session-service";

const menuWeeksEntity = new SessionUpdatableService(
  new UpdatableRepository(db, menuWeeks, menuWeeks.publicId, menuWeeks.id),
);
const menuItemsEntity = new SessionBaseService(
  new BaseRepository(db, menuItems, menuItems.publicId, menuItems.id),
);

export const menuService = {
  async upsertWeek(input: { weekStart: string; orderCutoff: string }) {
    const cutoffMs = new Date(input.orderCutoff).getTime();
    const [existing] = await db.select().from(menuWeeks).where(eq(menuWeeks.weekStart, input.weekStart)).limit(1);
    if (existing) {
      return menuWeeksEntity.update(existing.publicId, { orderCutoff: cutoffMs });
    }
    return menuWeeksEntity.create({ weekStart: input.weekStart, orderCutoff: cutoffMs });
  },

  async addItem(input: { menuWeekId: string; dayOfWeek: "mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun"; slot: string; dishId: string; isDefault: boolean }) {
    const [slot] = await db.select().from(mealSlots).where(and(eq(mealSlots.key, input.slot), eq(mealSlots.enabled, true))).limit(1);
    if (!slot) throw new ValidationError("Slot is not enabled");
    const [week] = await db.select({ id: menuWeeks.id }).from(menuWeeks).where(eq(menuWeeks.publicId, input.menuWeekId)).limit(1);
    if (!week) throw new ValidationError("Week not found");
    const [dish] = await db.select({ id: dishes.id }).from(dishes).where(eq(dishes.publicId, input.dishId)).limit(1);
    if (!dish) throw new ValidationError("Dish not found");
    // Idempotent on the composite key: commons create() does a plain insert, so
    // check for an existing row first (preserves the old onConflictDoNothing).
    const [dupe] = await db.select({ id: menuItems.id }).from(menuItems)
      .where(and(
        eq(menuItems.menuWeekId, week.id),
        eq(menuItems.dayOfWeek, input.dayOfWeek),
        eq(menuItems.slot, input.slot),
        eq(menuItems.dishId, dish.id),
      )).limit(1);
    if (dupe) return null;
    return menuItemsEntity.create({
      menuWeekId: week.id, dayOfWeek: input.dayOfWeek, slot: input.slot, dishId: dish.id, isDefault: input.isDefault,
    });
  },

  async removeItem(publicId: string) {
    await menuItemsEntity.delete(publicId);
  },

  async setDefault(itemPublicId: string) {
    const [item] = await db.select().from(menuItems).where(eq(menuItems.publicId, itemPublicId)).limit(1);
    if (!item) throw new ValidationError("Item not found");
    // Raw bulk update by composite key (clear other defaults for this slot, then
    // set this one). No commons bulk helper this slice → NOT audited. Documented.
    await db.update(menuItems).set({ isDefault: false })
      .where(and(eq(menuItems.menuWeekId, item.menuWeekId), eq(menuItems.dayOfWeek, item.dayOfWeek), eq(menuItems.slot, item.slot)));
    await db.update(menuItems).set({ isDefault: true }).where(eq(menuItems.publicId, itemPublicId));
  },

  async release(weekPublicId: string) {
    await menuWeeksEntity.update(weekPublicId, { status: "released", releasedAt: Date.now() });
  },

  async weekWithItems(weekPublicId: string) {
    const [week] = await db.select().from(menuWeeks).where(eq(menuWeeks.publicId, weekPublicId)).limit(1);
    if (!week) return { week: undefined, items: [] };
    const items = await db.select().from(menuItems).where(eq(menuItems.menuWeekId, week.id));
    return { week, items };
  },
};
```

Behavior notes preserved: `upsertWeek` returns the week row; `addItem` returns the row or `null` when the item already exists; `release`/`removeItem` return void; `setDefault` stays raw (documented). `release`'s previous impl threw "Week not found" when missing — `update` now throws `NotFoundError` instead; that is an acceptable, equivalent error for a missing week (callers pass valid public ids from the admin UI). If a caller/test asserts the exact old message, keep a pre-check `read`; otherwise accept `NotFoundError`.

- [ ] **Step 4: Run to verify it passes + typecheck**

Run: `cd apps/web && pnpm typecheck && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/services/__tests__/menu.service.test.ts lib/menu/__tests__/selections.service.test.ts lib/menu/__tests__/selections-cutoff.test.ts`
Expected: typecheck clean; menu.service tests pass; the selections tests (which consume `menuService.weekWithItems`) still pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/services/menu.service.ts apps/web/lib/services/__tests__/menu.service.test.ts
git commit -m "refactor(menu): route menu writes through intermediate entity services (audited)"
```

---

### Task 5: Retrofit `inquiries.service.ts` activity inserts

**Files:**
- Modify: `apps/web/lib/services/inquiries.service.ts`
- Test: `apps/web/lib/services/__tests__/inquiries-convert.test.ts` (existing — verify still green)

**Interfaces:**
- Consumes: `SessionBaseService` from `./session-service`; `BaseRepository` from `@tiffin/commons-drizzle`.
- Produces: `inquiriesService` unchanged public API; the 5 raw `db.insert(inquiryActivities)` replaced by a composed activity service.

- [ ] **Step 1: Add the composed activity service**

In `apps/web/lib/services/inquiries.service.ts`:
- Add imports: `import { BaseRepository } from "@tiffin/commons-drizzle";` and ensure `SessionBaseService` is imported from `./session-service` (the file already imports `SessionUpdatableService`).
- Add a module-level composed service after the existing repo/service construction:

```typescript
const inquiryActivitiesService = new SessionBaseService(
  new BaseRepository(db, inquiryActivities, inquiryActivities.publicId, inquiryActivities.id),
);
```

- [ ] **Step 2: Replace the raw activity inserts**

Replace each of the 5 `await db.insert(inquiryActivities).values({ ... })` calls with `await inquiryActivitiesService.create({ ... })` using the SAME value object (drop the manual `createdBy: await this.currentUserId()` — the intermediate stamps it). Example for `create`:

```typescript
await inquiryActivitiesService.create({
  inquiryId: inq.id,
  type: "created",
  toStage: inq.stage,
});
```

Apply the same transformation to the inserts in `addNote`, `changeStage`, and `convert` (and any other). Keep the surrounding logic identical.

- [ ] **Step 3: Run the inquiries tests + typecheck**

Run: `cd apps/web && pnpm typecheck && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/services/__tests__/inquiries-convert.test.ts`
Expected: typecheck clean; tests pass. (If the convert test's `reset()` doesn't clear `auditLog`, audit rows accumulate harmlessly — no FK, no count assertions on inquiry tables broken. Add `await db.delete(auditLog)` to its reset only if a uniqueness/count assertion fails.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/services/inquiries.service.ts
git commit -m "refactor(inquiries): route activity writes through composed intermediate service (audited)"
```

---

### Task 6: Retrofit `app-settings.service.ts` to the intermediate layer

**Files:**
- Modify: `apps/web/lib/services/app-settings.service.ts`
- Test: `apps/web/lib/services/__tests__/app-settings.service.test.ts` (create if none exists; otherwise extend)

**Interfaces:**
- Consumes: `SessionUpdatableService` from `./session-service`; `UpdatableRepository` from `@tiffin/commons-drizzle`.
- Produces: `getAppSettings()` / `setAppSettings()` unchanged signatures; the raw insert/update replaced.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/services/__tests__/app-settings.service.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { appSettings, auditLog } = await import("@/db/schema");
const { getAppSettings, setAppSettings } = await import("../app-settings.service");

async function reset() {
  await db.delete(auditLog);
  await db.delete(appSettings);
}

describe("app-settings service (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("creates then updates the singleton and audits both", async () => {
    await setAppSettings({ timezone: "America/Toronto", cutoffHour: 17 });
    let s = await getAppSettings();
    expect(s.cutoffHour).toBe(17);
    await setAppSettings({ timezone: "America/Toronto", cutoffHour: 19 });
    s = await getAppSettings();
    expect(s.cutoffHour).toBe(19);
    const rows = await db.select().from(appSettings);
    expect(rows).toHaveLength(1); // still a singleton
    const audits = await db.select().from(auditLog).where(eq(auditLog.entity, "app_settings"));
    expect(audits.some((r) => r.operation === "create")).toBe(true);
    expect(audits.some((r) => r.operation === "update")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/services/__tests__/app-settings.service.test.ts`
Expected: FAIL — no audit rows for `app_settings` (current impl writes raw).

- [ ] **Step 3: Refactor `app-settings.service.ts`**

```typescript
import { UpdatableRepository } from "@tiffin/commons-drizzle";
import { db } from "@/db/client";
import { appSettings } from "@/db/schema";
import { SessionUpdatableService } from "./session-service";

const DEFAULTS = { timezone: "America/Toronto", cutoffHour: 18 } as const;

const appSettingsEntity = new SessionUpdatableService(
  new UpdatableRepository(db, appSettings, appSettings.publicId, appSettings.id),
);

export async function getAppSettings(): Promise<{ timezone: string; cutoffHour: number }> {
  const [row] = await db.select().from(appSettings).limit(1);
  if (!row) return { ...DEFAULTS };
  return { timezone: row.timezone, cutoffHour: row.cutoffHour };
}

export async function setAppSettings(input: { timezone: string; cutoffHour: number }): Promise<void> {
  const [row] = await db.select({ publicId: appSettings.publicId }).from(appSettings).limit(1);
  if (row) {
    await appSettingsEntity.update(row.publicId, { timezone: input.timezone, cutoffHour: input.cutoffHour });
  } else {
    await appSettingsEntity.create({ timezone: input.timezone, cutoffHour: input.cutoffHour });
  }
}
```

- [ ] **Step 4: Run to verify it passes + typecheck**

Run: `cd apps/web && pnpm typecheck && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/services/__tests__/app-settings.service.test.ts`
Expected: typecheck clean; PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/services/app-settings.service.ts apps/web/lib/services/__tests__/app-settings.service.test.ts
git commit -m "refactor(app-settings): route singleton writes through intermediate service (audited)"
```

---

### Task 7: Full-suite gate + reseed

**Files:** none (verification task).

- [ ] **Step 1: Full suite**

Run: `cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run`
Expected: PASS. Known flake: `next-id.test.ts` may fail under load — if it's the ONLY failure, gate is green. If any service test fails because audit rows accumulated and a `reset()` lacks `db.delete(auditLog)`, add that line to the offending test's reset and re-run (audit_log has no FK, so delete order is unconstrained).

- [ ] **Step 2: commons-drizzle suite**

Run: `cd packages/commons-drizzle && pnpm vitest run`
Expected: PASS (Task 1 getter test + existing).

- [ ] **Step 3: Reseed the dev DB**

Run:
```bash
cd apps/web && D="postgres://lawbringr@localhost:5432/tiffin" && DATABASE_URL="$D" pnpm db:seed && DATABASE_URL="$D" pnpm db:seed:catalog && DATABASE_URL="$D" pnpm db:seed:menu && DATABASE_URL="$D" pnpm db:seed:admin
```
Expected: seeds complete.

---

## Self-Review

**Spec coverage:**
- Three-layer layering + super-chaining: Tasks 3 (intermediate), 4/5/6 (services extend + delegate). ✓
- `audit_log` table + migration: Task 2. ✓
- Audit hook (create/update/delete, best-effort, full-values changes, tableName): Task 3. ✓
- `BaseRepository.tableName` getter (only commons addition): Task 1. ✓
- Retrofit menu / inquiries-activities / app-settings: Tasks 4/5/6. ✓
- Documented raw exceptions (createOrder untouched; menu.setDefault raw): Task 4 (setDefault comment); createOrder not in scope (left as-is). ✓
- Testing + reseed: Tasks 1,3,4,6 (unit/integration) + Task 7 (gate). ✓

**Placeholder scan:** none — all steps carry concrete code/commands.

**Type consistency:** `recordAudit(entry: AuditEntry)` signature consistent across Task 3 definition and the test. `menuService` method names unchanged (consumers stable). `SessionBaseService`/`SessionUpdatableService` names match session-service.ts.

**Open verification points for implementers (confirm against code, adjust inline):**
- `BaseService.repo` visibility is `protected readonly` (service.ts) — direct `this.repo.tableName` works; if it were private, expose a protected getter on the commons service instead.
- `inquiries.service.ts` exact set of raw `db.insert(inquiryActivities)` sites (plan says 5) — replace each; confirm count when editing.
- Whether `release()`'s missing-week error message is asserted anywhere — if so, keep a pre-check; else `NotFoundError` is fine.
