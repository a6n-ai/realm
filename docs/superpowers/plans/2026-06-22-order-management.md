# Agent Order Management (CRM) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give agents (admin/member) a CRM to browse, search, and manage customer orders end to end — list/detail, lifecycle actions (activate/cancel/pause/resume), coming-week meal-pick oversight, and a customer-360 record.

**Architecture:** New routes under `(dashboard)`: `/dashboard/orders`, `/dashboard/orders/[id]`, `/dashboard/customers`, `/dashboard/customers/[id]`. Order data/lifecycle logic lives in `lib/services/orders.service.ts` (extended); a new `order_activities` audit table mirrors `inquiry_activities`. Pause is a fixed date window stored on `orders` that the existing pure `subscriptionDeliveryDates` function honors by skipping-without-counting, auto-extending the tail. Meal oversight reuses the staff-authorized `pickDish` action via an extracted `buildMealsGrid` helper.

**Tech Stack:** Next.js 16 (modified — read `node_modules/next/dist/docs/` before framework code), React Server Components + server actions, Drizzle ORM + Postgres, vitest, Tailwind + shadcn (`@/components/ui`, `@/components/ds`).

## Global Constraints

- Monorepo: shared code → `@tiffin/commons{,-drizzle,-next}`, not `apps/web` (TD-1). `subscriptionDeliveryDates` stays in `apps/web/lib/menu/delivery-dates.ts` (it already lives there) — do not relocate this slice.
- Admin editors use typed controls (select/multiselect/date), never free-text for enum/date/refs (TD-3). Lifecycle date inputs are `<input type="date">`.
- Time semantics (TD-4): cutoffs/pause windows anchored to delivery TZ (`America/Toronto`), epoch-ms storage, DST-aware via `@tiffin/commons` helpers. Pause window columns are `date` (calendar dates, no TZ).
- Terminology: **"order"** everywhere, never "subscription" (function name `subscriptionDeliveryDates` is pre-existing — leave it).
- Tests run from `apps/web` prefixed with `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin"`. Tests wipe the dev DB — reseed after the full run: `pnpm db:seed && db:seed:catalog && db:seed:menu && db:seed:admin`.
- Tests importing session services must `vi.mock("@/lib/auth", () => ({ auth: async () => null }))` then `await import(...)` the module under test.
- drizzle-kit `generate` needs a TTY here — hand-write the migration SQL + add the `meta/_journal.json` entry. Do NOT rebaseline headlessly. Migration snapshot JSON 0003–0006 is already missing (known debt); `db:migrate` works via the journal.
- Plain commits, NO `Co-Authored-By` trailer.

---

### Task 1: Schema + migration — `paused` status, pause columns, `order_activities`

**Files:**
- Modify: `apps/web/db/schema/orders.ts`
- Create: `apps/web/db/migrations/0007_order_management.sql`
- Modify: `apps/web/db/migrations/meta/_journal.json`

**Interfaces:**
- Produces: `orderStatus` enum gains `"paused"`. `orders.pausedFrom` / `orders.pausedUntil` (nullable `date`, string mode). New `orderActivities` table + `orderActivityType` enum, exported from `db/schema` (via existing `export * from "./orders"`).

- [ ] **Step 1: Extend the schema file**

In `apps/web/db/schema/orders.ts`, update the status enum and `orders` columns, and append the new enum + table. Replace line 6 and add columns after `status` (line 25), then add the table at the end:

```typescript
export const orderStatus = pgEnum("order_status", ["pending", "active", "waitlisted", "cancelled", "paused"]);
export const paymentStatus = pgEnum("payment_status", ["simulated_paid"]);
export const orderActivityType = pgEnum("order_activity_type", [
  "created", "status_change", "paused", "resumed", "cancelled", "activated", "meal_pick", "note",
]);
```

Inside `orders` table, after the `status` column (line 25), add:

```typescript
  pausedFrom: date("paused_from"),
  pausedUntil: date("paused_until"),
```

At the end of the file, add the table:

```typescript
export const orderActivities = pgTable("order_activities", {
  ...baseColumns("oac"),
  orderId: bigint("order_id", { mode: "bigint" }).notNull().references(() => orders.id, { onDelete: "cascade" }),
  type: orderActivityType("type").notNull(),
  note: text("note"),
  fromStatus: orderStatus("from_status"),
  toStatus: orderStatus("to_status"),
});
```

`baseColumns`, `date`, `text`, `bigint`, `pgTable`, `pgEnum` are already imported at the top of the file (verify `date` and `text` are in the `drizzle-orm/pg-core` import list — they are).

- [ ] **Step 2: Hand-write the migration SQL**

Create `apps/web/db/migrations/0007_order_management.sql`:

```sql
ALTER TYPE "order_status" ADD VALUE IF NOT EXISTS 'paused';
--> statement-breakpoint
CREATE TYPE "order_activity_type" AS ENUM('created', 'status_change', 'paused', 'resumed', 'cancelled', 'activated', 'meal_pick', 'note');
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paused_from" date;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paused_until" date;
--> statement-breakpoint
CREATE TABLE "order_activities" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"order_id" bigint NOT NULL,
	"type" "order_activity_type" NOT NULL,
	"note" text,
	"from_status" "order_status",
	"to_status" "order_status",
	CONSTRAINT "order_activities_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "order_activities" ADD CONSTRAINT "order_activities_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
```

Note: the `baseColumns("oac")` shape = `id, public_id, created_at, created_by` (no `updated_*`). Confirm against `0006_app_settings.sql` minus the `updated_*` columns. The `ALTER TYPE ... ADD VALUE` is first and isolated by a breakpoint; on PG12+ the value is added but not used at migrate time (defaults stay `pending`), so this is safe.

- [ ] **Step 3: Add the journal entry**

In `apps/web/db/migrations/meta/_journal.json`, append to the `entries` array after the `0006_app_settings` entry (idx 6):

```json
    {
      "idx": 7,
      "version": "7",
      "when": 1782400000000,
      "tag": "0007_order_management",
      "breakpoints": true
    }
```

(Add a comma after the closing brace of the idx-6 entry.)

- [ ] **Step 4: Run the migration**

Run: `cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:migrate`
Expected: completes without error; reports applying `0007_order_management`.

- [ ] **Step 5: Verify the schema landed**

Run:
```bash
cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" psql "$DATABASE_URL" -c "\d order_activities" -c "select unnest(enum_range(NULL::order_status));" -c "\d orders" | grep -E "paused|order_activities|from_status"
```
Expected: `order_activities` table exists; `order_status` includes `paused`; `orders` has `paused_from`/`paused_until`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/db/schema/orders.ts apps/web/db/migrations/0007_order_management.sql apps/web/db/migrations/meta/_journal.json
git commit -m "feat(orders): add paused status, pause-window columns, order_activities table"
```

---

### Task 2: Pause window in `subscriptionDeliveryDates` (pure, TDD)

**Files:**
- Modify: `apps/web/lib/menu/delivery-dates.ts:18-38`
- Test: `apps/web/lib/menu/__tests__/delivery-dates.test.ts`

**Interfaces:**
- Consumes: existing `subscriptionDeliveryDates({ startDate, durationWeeks, deliveryDays })`.
- Produces: optional 4th field `pauseWindow?: { from: string; until: string }` (inclusive ISO dates). Dates inside the window are skipped without counting toward `total`, so the tail extends. Absent window = unchanged behavior.

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/lib/menu/__tests__/delivery-dates.test.ts` inside the `describe("subscriptionDeliveryDates", ...)` block:

```typescript
  it("skips delivery dates inside the pause window and extends the tail", () => {
    // Mon start, Mon–Fri, 2 weeks = 10 deliveries. Pause covers all of week 1 (06-22..06-26).
    const r = subscriptionDeliveryDates({
      startDate: "2026-06-22",
      durationWeeks: 2,
      deliveryDays: ["mon", "tue", "wed", "thu", "fri"],
      pauseWindow: { from: "2026-06-22", until: "2026-06-26" },
    });
    expect(r).toHaveLength(10); // still 10 deliveries
    // none fall inside the paused week
    expect(r.every((d) => d.dateIso < "2026-06-22" || d.dateIso > "2026-06-26")).toBe(true);
    // first delivery is the Monday after the window
    expect(r[0].dateIso).toBe("2026-06-29");
    // tail extended into week 3 (week of 07-06)
    expect(r[r.length - 1].dateIso).toBe("2026-07-10"); // Fri of week 3
  });

  it("is unchanged when no pause window is given", () => {
    const r = subscriptionDeliveryDates({ startDate: "2026-06-22", durationWeeks: 1, deliveryDays: ["mon", "wed", "fri"] });
    expect(r.map((d) => d.dateIso)).toEqual(["2026-06-22", "2026-06-24", "2026-06-26"]);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/menu/__tests__/delivery-dates.test.ts`
Expected: FAIL — `pauseWindow` not honored (length/dates wrong) or type error.

- [ ] **Step 3: Implement the pause window**

Replace `subscriptionDeliveryDates` (lines 17–38) in `apps/web/lib/menu/delivery-dates.ts`:

```typescript
// First durationWeeks × deliveryDays.length delivery dates on/after startDate.
// A pauseWindow (inclusive ISO dates) suppresses any delivery inside it without
// counting it toward the total, so the tail extends to still yield all deliveries.
export function subscriptionDeliveryDates(input: {
  startDate: string;
  durationWeeks: number;
  deliveryDays: DayOfWeek[];
  pauseWindow?: { from: string; until: string };
}): DeliveryDate[] {
  const want = new Set(input.deliveryDays);
  const total = input.durationWeeks * input.deliveryDays.length;
  const pause = input.pauseWindow;
  const out: DeliveryDate[] = [];
  const d = parseIsoDateUtc(input.startDate);
  // Walk forward day-by-day, collecting matching weekdays until we have `total`.
  // Skipped (paused) days don't count, so widen the guard to allow the extension.
  for (let guard = 0; out.length < total && guard < total * 7 + 400; guard++) {
    const dow = weekdayKey(d);
    const dateIso = iso(d);
    const paused = !!pause && dateIso >= pause.from && dateIso <= pause.until;
    if (want.has(dow) && !paused) {
      out.push({ dateIso, dayOfWeek: dow, weekStartIso: mondayOfIso(dateIso) });
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/menu/__tests__/delivery-dates.test.ts`
Expected: PASS (all, including the two pre-existing cases).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/menu/delivery-dates.ts apps/web/lib/menu/__tests__/delivery-dates.test.ts
git commit -m "feat(menu): pause-window param on subscriptionDeliveryDates extends the tail"
```

---

### Task 3: Order service — list/read/activities queries (TDD, integration)

**Files:**
- Modify: `apps/web/lib/services/orders.service.ts`
- Test: `apps/web/lib/services/__tests__/orders-crm.service.test.ts` (create)

**Interfaces:**
- Consumes: `db`, `orders`, `payments`, `orderActivities`, `plans`, `users`, `deliveryFrequencies`, `mealSizes` from `@/db/schema`.
- Produces (exported from `orders.service.ts`):
  - `type OrderListRow = { publicId: string; deploymentId: string; fullName: string; phone: string; city: string; planKey: string; status: string; startDate: string; total: string; createdAt: number }`
  - `listOrders(filter?: { status?: string; search?: string }): Promise<OrderListRow[]>`
  - `readOrder(publicId: string): Promise<OrderDetail>` where `OrderDetail` includes the order row + `planName`, `frequencyKey`, `mealSizeName`, `payments: { publicId: string; amount: string; status: string }[]`. Throws `NotFoundError` when missing.
  - `listOrderActivities(orderId: bigint): Promise<(typeof orderActivities.$inferSelect)[]>`

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/services/__tests__/orders-crm.service.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { nextWeekday } from "@tiffin/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { orders, payments, orderActivities, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../orders.service");
const { listOrders, readOrder } = await import("../orders.service");

async function reset() {
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users);
}

const baseInput = (mealSizePublicId: string, planKey: string, fullName = "Jane Customer", phone = "+16475550111") => ({
  planKey,
  selections: {
    mealSizeId: mealSizePublicId,
    frequencyKey: "5_day" as const,
    persons: 1,
    mealSlots: ["lunch"],
    includeSaturday: false,
    includeSunday: false,
    durationWeeks: 1,
    startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
  },
  contact: { fullName, phone, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
});

describe("order CRM queries (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("listOrders returns rows and filters by search + status", async () => {
    const snap = await loadCatalogSnapshot();
    await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key, "Jane Customer", "+16475550111"));
    await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key, "Bob Buyer", "+16475550222"));

    const all = await listOrders();
    expect(all.length).toBe(2);

    const byName = await listOrders({ search: "jane" });
    expect(byName.map((r) => r.fullName)).toEqual(["Jane Customer"]);

    const byPhone = await listOrders({ search: "550222" });
    expect(byPhone.map((r) => r.fullName)).toEqual(["Bob Buyer"]);

    const pending = await listOrders({ status: "pending" });
    expect(pending.length).toBe(2); // createOrder defaults to pending
    const active = await listOrders({ status: "active" });
    expect(active.length).toBe(0);
  });

  it("readOrder returns detail with plan/payment info", async () => {
    const snap = await loadCatalogSnapshot();
    const { publicId } = await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key));
    const detail = await readOrder(publicId);
    expect(detail.publicId).toBe(publicId);
    expect(detail.planName).toBeTruthy();
    expect(detail.payments.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/services/__tests__/orders-crm.service.test.ts`
Expected: FAIL — `listOrders`/`readOrder` not exported.

- [ ] **Step 3: Implement the queries**

In `apps/web/lib/services/orders.service.ts`, add the imports needed at the top (extend the existing import from `@/db/schema` and drizzle):

```typescript
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { NotFoundError } from "@tiffin/commons";
import { orders, payments, orderActivities, users, plans, deliveryFrequencies, mealSizes } from "@/db/schema";
```

(Merge with existing imports — `orders`, `payments`, `users` are already imported; add `orderActivities`, `plans`, `deliveryFrequencies`, `mealSizes`; add `and, desc, ilike, or` to the drizzle import that currently has `eq, sql`.)

Append these functions and types to the file:

```typescript
export type OrderListRow = {
  publicId: string;
  deploymentId: string;
  fullName: string;
  phone: string;
  city: string;
  planKey: string;
  status: string;
  startDate: string;
  total: string;
  createdAt: number;
};

export async function listOrders(filter: { status?: string; search?: string } = {}): Promise<OrderListRow[]> {
  const conds = [];
  if (filter.status && filter.status !== "all") {
    conds.push(eq(orders.status, filter.status as typeof orders.status.enumValues[number]));
  }
  if (filter.search?.trim()) {
    const q = `%${filter.search.trim()}%`;
    conds.push(or(ilike(orders.fullName, q), ilike(orders.phone, q), ilike(orders.deploymentId, q)));
  }
  const rows = await db
    .select({
      publicId: orders.publicId,
      deploymentId: orders.deploymentId,
      fullName: orders.fullName,
      phone: orders.phone ?? sql<string>`''`,
      city: orders.city,
      planKey: plans.key,
      status: orders.status,
      startDate: orders.startDate,
      total: orders.total,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(500);
  return rows as OrderListRow[];
}

export type OrderDetail = typeof orders.$inferSelect & {
  planName: string;
  planKey: string;
  frequencyKey: string;
  mealSizeName: string;
  payments: { publicId: string; amount: string; status: string }[];
};

export async function readOrder(publicId: string): Promise<OrderDetail> {
  const [row] = await db
    .select({
      order: orders,
      planName: plans.name,
      planKey: plans.key,
      frequencyKey: deliveryFrequencies.key,
      mealSizeName: mealSizes.name,
    })
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .innerJoin(deliveryFrequencies, eq(orders.frequencyId, deliveryFrequencies.id))
    .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .where(eq(orders.publicId, publicId))
    .limit(1);
  if (!row) throw new NotFoundError("Order not found");
  const pays = await db
    .select({ publicId: payments.publicId, amount: payments.amount, status: payments.status })
    .from(payments)
    .where(eq(payments.orderId, row.order.id));
  return { ...row.order, planName: row.planName, planKey: row.planKey, frequencyKey: row.frequencyKey, mealSizeName: row.mealSizeName, payments: pays };
}

export async function listOrderActivities(orderId: bigint) {
  return db.select().from(orderActivities).where(eq(orderActivities.orderId, orderId)).orderBy(desc(orderActivities.createdAt));
}
```

Note: `orders.phone` — confirm the orders table has no `phone` column (it does NOT — see schema; contact phone lives on the order as part of contact? Re-check: schema has `fullName, addressLine, city, postalCode` but NO `phone`). **Correction:** drop `phone` from `OrderListRow` and the select; search by `fullName` + `deploymentId` only. Update the type, the select (remove the `phone` line), the `or(...)` to `or(ilike(orders.fullName, q), ilike(orders.deploymentId, q))`, and remove `phone` from the test's expectations (delete the `byPhone` assertion block).

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/services/__tests__/orders-crm.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/services/orders.service.ts apps/web/lib/services/__tests__/orders-crm.service.test.ts
git commit -m "feat(orders): listOrders/readOrder/listOrderActivities query helpers"
```

---

### Task 4: Order service — lifecycle mutators with audit logging (TDD, integration)

**Files:**
- Modify: `apps/web/lib/services/orders.service.ts`
- Test: `apps/web/lib/services/__tests__/orders-lifecycle.service.test.ts` (create)

**Interfaces:**
- Consumes: `orders`, `orderActivities`, `db`, `ValidationError` from `@tiffin/commons`, `listOrderActivities` (Task 3).
- Produces (exported):
  - `activateOrder(publicId: string): Promise<void>` — only `waitlisted` → `active`.
  - `cancelOrder(publicId: string): Promise<void>` — any non-`cancelled` → `cancelled`.
  - `pauseOrder(publicId: string, window: { from: string; until: string }): Promise<void>` — only `active` → `paused`; validates `from <= until`.
  - `resumeOrder(publicId: string): Promise<void>` — only `paused` → `active`; clears `pausedFrom`/`pausedUntil`.
  - Each writes an `order_activities` row (`type` + `fromStatus`/`toStatus`), stamping `createdBy` via the same `sessionActorId` pattern used elsewhere.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/services/__tests__/orders-lifecycle.service.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { nextWeekday, ValidationError } from "@tiffin/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { orders, payments, orderActivities, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const svc = await import("../orders.service");

async function reset() {
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users);
}

async function makeOrder(status: "pending" | "active" | "waitlisted") {
  const snap = await loadCatalogSnapshot();
  const { publicId } = await svc.createOrder({
    planKey: snap.plans[0].key,
    selections: {
      mealSizeId: snap.mealSizes[0].publicId, frequencyKey: "5_day", persons: 1, mealSlots: ["lunch"],
      includeSaturday: false, includeSunday: false, durationWeeks: 1,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: { fullName: "Jane", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  await db.update(orders).set({ status }).where(eq(orders.publicId, publicId));
  return publicId;
}

describe("order lifecycle (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("activateOrder waitlisted → active and logs activity", async () => {
    const id = await makeOrder("waitlisted");
    await svc.activateOrder(id);
    const [o] = await db.select().from(orders).where(eq(orders.publicId, id));
    expect(o.status).toBe("active");
    const acts = await svc.listOrderActivities(o.id);
    expect(acts[0].type).toBe("activated");
    expect(acts[0].toStatus).toBe("active");
  });

  it("pauseOrder active → paused with window, resumeOrder clears it", async () => {
    const id = await makeOrder("active");
    await svc.pauseOrder(id, { from: "2026-07-06", until: "2026-07-10" });
    let [o] = await db.select().from(orders).where(eq(orders.publicId, id));
    expect(o.status).toBe("paused");
    expect(o.pausedFrom).toBe("2026-07-06");
    await svc.resumeOrder(id);
    [o] = await db.select().from(orders).where(eq(orders.publicId, id));
    expect(o.status).toBe("active");
    expect(o.pausedFrom).toBeNull();
  });

  it("rejects illegal transitions", async () => {
    const pending = await makeOrder("pending");
    await expect(svc.pauseOrder(pending, { from: "2026-07-06", until: "2026-07-10" })).rejects.toBeInstanceOf(ValidationError);
    await expect(svc.resumeOrder(pending)).rejects.toBeInstanceOf(ValidationError);
    const active = await makeOrder("active");
    await expect(svc.pauseOrder(active, { from: "2026-07-10", until: "2026-07-06" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("cancelOrder works from any non-cancelled status", async () => {
    const id = await makeOrder("active");
    await svc.cancelOrder(id);
    const [o] = await db.select().from(orders).where(eq(orders.publicId, id));
    expect(o.status).toBe("cancelled");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/services/__tests__/orders-lifecycle.service.test.ts`
Expected: FAIL — mutators not exported.

- [ ] **Step 3: Implement the mutators**

Append to `apps/web/lib/services/orders.service.ts`. Add `ValidationError` to the existing `@tiffin/commons` import (`generateCode, ValidationError` is already imported — add `NotFoundError` too if not present from Task 3). Reuse the `sessionActorId` helper pattern — import it:

```typescript
import { auth } from "@/lib/auth";

async function actorId(): Promise<bigint | null> {
  try {
    const publicId = (await auth())?.user?.id;
    if (!publicId) return null;
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1);
    return row?.id ?? null;
  } catch {
    return null;
  }
}

type OrderStatusValue = (typeof orders.status.enumValues)[number];

async function transition(
  publicId: string,
  guard: (current: OrderStatusValue) => void,
  patch: Partial<typeof orders.$inferInsert>,
  activity: { type: (typeof orderActivities.type.enumValues)[number]; toStatus: OrderStatusValue },
): Promise<void> {
  const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId)).limit(1);
  if (!order) throw new NotFoundError("Order not found");
  guard(order.status);
  const createdBy = await actorId();
  await db.transaction(async (tx) => {
    await tx.update(orders).set(patch).where(eq(orders.id, order.id));
    await tx.insert(orderActivities).values({
      orderId: order.id,
      type: activity.type,
      fromStatus: order.status,
      toStatus: activity.toStatus,
      createdBy,
    });
  });
}

export async function activateOrder(publicId: string): Promise<void> {
  await transition(
    publicId,
    (c) => { if (c !== "waitlisted") throw new ValidationError(`Cannot activate an order that is ${c}`); },
    { status: "active" },
    { type: "activated", toStatus: "active" },
  );
}

export async function cancelOrder(publicId: string): Promise<void> {
  await transition(
    publicId,
    (c) => { if (c === "cancelled") throw new ValidationError("Order is already cancelled"); },
    { status: "cancelled" },
    { type: "cancelled", toStatus: "cancelled" },
  );
}

export async function pauseOrder(publicId: string, window: { from: string; until: string }): Promise<void> {
  if (window.from > window.until) throw new ValidationError("Pause start must be on or before pause end");
  await transition(
    publicId,
    (c) => { if (c !== "active") throw new ValidationError(`Cannot pause an order that is ${c}`); },
    { status: "paused", pausedFrom: window.from, pausedUntil: window.until },
    { type: "paused", toStatus: "paused" },
  );
}

export async function resumeOrder(publicId: string): Promise<void> {
  await transition(
    publicId,
    (c) => { if (c !== "paused") throw new ValidationError(`Cannot resume an order that is ${c}`); },
    { status: "active", pausedFrom: null, pausedUntil: null },
    { type: "resumed", toStatus: "active" },
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/services/__tests__/orders-lifecycle.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/services/orders.service.ts apps/web/lib/services/__tests__/orders-lifecycle.service.test.ts
git commit -m "feat(orders): lifecycle mutators (activate/cancel/pause/resume) with audit log"
```

---

### Task 5: Extract `buildMealsGrid` helper, rewire meals page

**Files:**
- Create: `apps/web/lib/menu/meals-grid.ts`
- Modify: `apps/web/app/(dashboard)/dashboard/meals/page.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/meals/meals-grid.tsx:7` (import of `GridCell`)

**Interfaces:**
- Produces: `export type GridCell` (moved from `meals/page.tsx`), `export type WeekDateView = { dateIso: string; dayOfWeek: DayOfWeek; weekStartIso: string; lockMs: number; locked: boolean }`, and
  `buildMealsGrid(order: MealOrder, settings: { timezone: string; cutoffHour: number }): Promise<{ releasedWeek; weekDatesView: WeekDateView[]; grid: GridCell[]; enabledSlots; persons: number } | { empty: "no-week" | "no-dates" }>` where `MealOrder` is the order row shape the meals page already selects (id, publicId, planId, persons, mealSlots, includeSaturday, includeSunday, startDate, durationWeeks, frequencyKey).

- [ ] **Step 1: Create the helper by moving logic out of `page.tsx`**

Create `apps/web/lib/menu/meals-grid.ts` containing the released-week lookup, delivery-date computation, slot/dish assembly, and grid building currently in `meals/page.tsx` lines 74–197. Export `GridCell`, `WeekDateView`, `MealOrder`, and `buildMealsGrid`. Move the imports it needs (`and, asc, eq, inArray, desc` from drizzle; `cutoffMsFor` from `@tiffin/commons`; `db`, schema tables, `orderDeliveryDays`, `visibleSlots`, `subscriptionDeliveryDates`, `comingWeekStartIso`, `selectionsService`, `menuService`). Honor the pause window: when the order is `paused` (has `pausedFrom`/`pausedUntil`), pass `pauseWindow` into `subscriptionDeliveryDates`.

```typescript
import { and, asc, eq, inArray } from "drizzle-orm";
import { cutoffMsFor } from "@tiffin/commons";
import { db } from "@/db/client";
import { dishes, mealSlots, menuWeeks, plans } from "@/db/schema";
import { orderDeliveryDays, visibleSlots } from "./delivery-days";
import { comingWeekStartIso, subscriptionDeliveryDates, type DayOfWeek, type DeliveryDate } from "./delivery-dates";
import { selectionsService } from "./selections.service";
import { menuService } from "@/lib/services/menu.service";

export type GridCell = {
  day: DayOfWeek;
  dateIso: string;
  slot: string;
  personIndex: number;
  selectedDishId: string | null;
  dishes: { id: string; name: string; diet: "veg" | "nonveg" }[];
  locked: boolean;
};

export type WeekDateView = DeliveryDate & { lockMs: number; locked: boolean };

export type MealOrder = {
  id: bigint;
  publicId: string;
  planId: bigint;
  persons: number;
  mealSlots: string[];
  includeSaturday: boolean;
  includeSunday: boolean;
  startDate: string;
  durationWeeks: number;
  frequencyKey: string;
  pausedFrom?: string | null;
  pausedUntil?: string | null;
};

export type MealsGridResult =
  | { empty: "no-week" | "no-dates" }
  | { empty: null; releasedWeek: typeof menuWeeks.$inferSelect; weekDatesView: WeekDateView[]; grid: GridCell[]; enabledSlots: { key: string; label: string; sortOrder: number }[]; persons: number };

export async function buildMealsGrid(order: MealOrder, settings: { timezone: string; cutoffHour: number }): Promise<MealsGridResult> {
  const { timezone, cutoffHour } = settings;
  const comingMonday = comingWeekStartIso(Date.now(), timezone);

  const [releasedWeek] = await db
    .select().from(menuWeeks)
    .where(and(eq(menuWeeks.status, "released"), eq(menuWeeks.weekStart, comingMonday))).limit(1);
  if (!releasedWeek) return { empty: "no-week" };

  const deliveryDays = orderDeliveryDays({
    frequencyKey: order.frequencyKey,
    includeSaturday: order.includeSaturday,
    includeSunday: order.includeSunday,
  });
  const pauseWindow = order.pausedFrom && order.pausedUntil ? { from: order.pausedFrom, until: order.pausedUntil } : undefined;
  const subDates = subscriptionDeliveryDates({
    startDate: order.startDate, durationWeeks: order.durationWeeks, deliveryDays, pauseWindow,
  });
  const weekDates = subDates.filter((d) => d.weekStartIso === releasedWeek.weekStart);
  if (weekDates.length === 0) return { empty: "no-dates" };

  const [planRow] = await db.select({ key: plans.key }).from(plans).where(eq(plans.id, order.planId)).limit(1);
  const planKey = planRow?.key ?? "mixed";
  const allowedDiets: ("veg" | "nonveg")[] =
    planKey === "veg" ? ["veg"] : planKey === "halal_nonveg" ? ["nonveg"] : ["veg", "nonveg"];

  const { items: allItems } = await menuService.weekWithItems(releasedWeek.publicId);
  const allDishBigintIds = [...new Set(allItems.map((i) => i.dishId))];
  const [allSlotsRows, picks, dishRows] = await Promise.all([
    db.select({ key: mealSlots.key, label: mealSlots.label, sortOrder: mealSlots.sortOrder }).from(mealSlots).orderBy(asc(mealSlots.sortOrder)),
    selectionsService.effectiveSelections(order.id, releasedWeek.id),
    allDishBigintIds.length > 0
      ? db.select({ id: dishes.publicId, bigintId: dishes.id, name: dishes.name, diet: dishes.diet }).from(dishes).where(inArray(dishes.id, allDishBigintIds)).orderBy(asc(dishes.name))
      : Promise.resolve([]),
  ]);

  const dishMap = new Map(dishRows.map((d) => [d.bigintId, { id: d.id, name: d.name, diet: d.diet }]));
  const dishPublicIdByBigintId = new Map(dishRows.map((d) => [d.bigintId, d.id]));
  const purchasedSlotKeys = new Set(order.mealSlots);
  const enabledSlots = allSlotsRows.filter((s) => purchasedSlotKeys.has(s.key));

  const weekDatesView: WeekDateView[] = weekDates.map((d) => {
    const lockMs = cutoffMsFor(d.dateIso, cutoffHour, timezone);
    return { ...d, lockMs, locked: Date.now() > lockMs };
  });

  const grid: GridCell[] = [];
  for (const { dateIso, dayOfWeek: day, locked } of weekDatesView) {
    const dayItems = allItems.filter((i) => i.dayOfWeek === day);
    const slots = visibleSlots(order.mealSlots, order.mealSlots, dayItems);
    for (const slot of slots) {
      const slotItems = dayItems.filter((i) => i.slot === slot);
      const slotDishes = slotItems
        .map((i) => dishMap.get(i.dishId))
        .filter((d): d is { id: string; name: string; diet: "veg" | "nonveg" } => !!d && allowedDiets.includes(d.diet));
      if (slotDishes.length === 0) continue;
      for (let p = 1; p <= order.persons; p++) {
        const pick = picks.find((sel) => sel.dayOfWeek === day && sel.slot === slot && sel.personIndex === p);
        let selectedDishId: string | null = null;
        if (pick) {
          selectedDishId = dishPublicIdByBigintId.get(pick.dishId) ?? null;
        } else {
          const defaultItem = slotItems.find((i) => i.isDefault);
          selectedDishId = defaultItem ? (dishPublicIdByBigintId.get(defaultItem.dishId) ?? null) : null;
        }
        grid.push({ day, dateIso, slot, personIndex: p, selectedDishId, dishes: slotDishes, locked });
      }
    }
  }
  return { empty: null, releasedWeek, weekDatesView, grid, enabledSlots, persons: order.persons };
}
```

- [ ] **Step 2: Rewire `meals/page.tsx` to use the helper**

Replace lines 74–215 (everything from `const { timezone, cutoffHour } = await getAppSettings();` through the end of the component) with a call to `buildMealsGrid(activeOrder, settings)` and render the result, mapping the `empty` cases to the existing `EmptyState` messages. The `activeOrder` selection (lines 38–59) must additionally select `pausedFrom: orders.pausedFrom, pausedUntil: orders.pausedUntil`. Update the `GridCell` import in `meals-grid.tsx` (the client component) from `./page` to `@/lib/menu/meals-grid`:

```typescript
import type { GridCell } from "@/lib/menu/meals-grid";
```

And in `meals/page.tsx`, remove the now-duplicated `GridCell` export and import it from the helper.

- [ ] **Step 3: Run existing meals tests + typecheck**

Run:
```bash
cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/menu/__tests__/selections.service.test.ts lib/menu/__tests__/selections-cutoff.test.ts && pnpm typecheck
```
Expected: PASS; no type errors. (`pnpm typecheck` per repo scripts — if absent, use `pnpm -w tsc --noEmit` or the project's lint/build check.)

- [ ] **Step 4: Verify meals page renders (manual)**

Run the app (`pnpm dev` from repo root) and visit `/dashboard/meals` as a customer with an active order; confirm the grid renders as before.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/menu/meals-grid.ts "apps/web/app/(dashboard)/dashboard/meals/page.tsx" "apps/web/app/(dashboard)/dashboard/meals/meals-grid.tsx"
git commit -m "refactor(meals): extract buildMealsGrid helper, honor pause window"
```

---

### Task 6: `OrderStatusBadge` + Orders list page

**Files:**
- Create: `apps/web/components/ds/order-status-badge.tsx`
- Modify: `apps/web/components/ds/index.ts`
- Create: `apps/web/app/(dashboard)/dashboard/orders/page.tsx`
- Create: `apps/web/app/(dashboard)/dashboard/orders/orders-list.tsx`

**Interfaces:**
- Consumes: `listOrders` (Task 3), `requireStaff`.
- Produces: `OrderStatusBadge` (ds), `OrdersList` client component, the `/dashboard/orders` route.

- [ ] **Step 1: Add `OrderStatusBadge`**

Create `apps/web/components/ds/order-status-badge.tsx` (mirrors `stage-badge.tsx`):

```typescript
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", active: "Active", waitlisted: "Waitlisted", paused: "Paused", cancelled: "Cancelled",
};
type Variant = "neutral" | "ok" | "warn" | "bad";
const STATUS_VARIANT: Record<string, Variant> = {
  pending: "neutral", active: "ok", waitlisted: "warn", paused: "warn", cancelled: "bad",
};
const VARIANT_CLASS: Record<Variant, string> = {
  neutral: "bg-muted text-muted-foreground border",
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  bad: "bg-bad/15 text-bad",
};

export function OrderStatusBadge({ status }: { status: string }) {
  const v = STATUS_VARIANT[status] ?? "neutral";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", VARIANT_CLASS[v])}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
```

Add to `apps/web/components/ds/index.ts`:

```typescript
export * from "./order-status-badge";
```

- [ ] **Step 2: Create the list page (server)**

Create `apps/web/app/(dashboard)/dashboard/orders/page.tsx`:

```typescript
import { PackageIcon } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { listOrders } from "@/lib/services/orders.service";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { OrdersList } from "./orders-list";

export default async function OrdersPage() {
  await requireStaff();
  const rows = await listOrders();
  return (
    <PageShell>
      <PageHeader icon={PackageIcon} title="Orders" subtitle={`${rows.length} total`} />
      <SectionCard title="All orders" subtitle={rows.length === 0 ? "Nothing yet" : undefined}>
        <OrdersList rows={rows} />
      </SectionCard>
    </PageShell>
  );
}
```

- [ ] **Step 3: Create the client list with filter + search**

Create `apps/web/app/(dashboard)/dashboard/orders/orders-list.tsx` (mirrors `inquiries-list.tsx`):

```typescript
"use client";

import { useState } from "react";
import { PackageIcon } from "lucide-react";
import { FilterBar, FilterPill, SearchInput, ListRow, OrderStatusBadge, EmptyState } from "@/components/ds";
import type { OrderListRow } from "@/lib/services/orders.service";

const STATUS_PILLS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "active", label: "Active" },
  { key: "waitlisted", label: "Waitlisted" },
  { key: "paused", label: "Paused" },
  { key: "cancelled", label: "Cancelled" },
] as const;

const fmt = (n: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);

export function OrdersList({ rows }: { rows: OrderListRow[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");

  const countOf = (s: string) => (s === "all" ? rows.length : rows.filter((r) => r.status === s).length);
  const filtered = rows.filter((r) => {
    const matchStatus = status === "all" || r.status === status;
    const q = search.toLowerCase();
    const matchSearch = !q || r.fullName.toLowerCase().includes(q) || r.deploymentId.toLowerCase().includes(q) || r.city.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  return (
    <div className="space-y-4">
      <FilterBar
        search={<SearchInput value={search} onChange={setSearch} placeholder="Search orders…" />}
        filters={STATUS_PILLS.map((p) => (
          <FilterPill key={p.key} label={p.label} active={status === p.key} count={countOf(p.key)} onClick={() => setStatus(p.key)} />
        ))}
      />
      {filtered.length === 0 ? (
        <EmptyState icon={PackageIcon} message="No orders match your filter." />
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => (
            <ListRow
              key={o.publicId}
              title={o.fullName}
              meta={`${o.deploymentId} · ${o.city} · ${o.planKey} · ${fmt(Number(o.total))}`}
              trailing={<OrderStatusBadge status={o.status} />}
              href={`/dashboard/orders/${o.publicId}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

(Confirm `FilterBar`'s `filters` prop accepts a node array — `inquiries-list.tsx` wraps in a fragment; match its exact usage, wrapping in `<>...</>` if required.)

- [ ] **Step 4: Verify build/typecheck + render**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors. Then `pnpm dev`, visit `/dashboard/orders` as admin — list renders, filter pills + search work, rows link to detail (404 until Task 7).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ds/order-status-badge.tsx apps/web/components/ds/index.ts "apps/web/app/(dashboard)/dashboard/orders/page.tsx" "apps/web/app/(dashboard)/dashboard/orders/orders-list.tsx"
git commit -m "feat(orders): orders list page with status filter + search"
```

---

### Task 7: Order detail page — summary + lifecycle + meals + activity

**Files:**
- Create: `apps/web/app/(dashboard)/dashboard/orders/[id]/page.tsx`
- Create: `apps/web/app/(dashboard)/dashboard/orders/[id]/lifecycle-controls.tsx`
- Create: `apps/web/app/(dashboard)/dashboard/orders/[id]/actions.ts`

**Interfaces:**
- Consumes: `readOrder`, `listOrderActivities`, `activateOrder`, `cancelOrder`, `pauseOrder`, `resumeOrder` (Tasks 3–4); `buildMealsGrid` (Task 5); `getAppSettings`; `pickDish` is NOT reused here directly — the embedded grid needs a server action; reuse the existing `meals/actions.ts` `pickDish` by importing it (it is staff-authorized and revalidates `/dashboard/meals`; add a `revalidatePath` for the order page — see Step 4).
- Produces: the `/dashboard/orders/[id]` route.

- [ ] **Step 1: Create the server actions**

Create `apps/web/app/(dashboard)/dashboard/orders/[id]/actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/guards";
import { activateOrder, cancelOrder, pauseOrder, resumeOrder } from "@/lib/services/orders.service";

export async function activate(orderId: string) {
  await requireStaff();
  await activateOrder(orderId);
  revalidatePath(`/dashboard/orders/${orderId}`);
}
export async function cancel(orderId: string) {
  await requireStaff();
  await cancelOrder(orderId);
  revalidatePath(`/dashboard/orders/${orderId}`);
}
export async function pause(orderId: string, window: { from: string; until: string }) {
  await requireStaff();
  await pauseOrder(orderId, window);
  revalidatePath(`/dashboard/orders/${orderId}`);
}
export async function resume(orderId: string) {
  await requireStaff();
  await resumeOrder(orderId);
  revalidatePath(`/dashboard/orders/${orderId}`);
}
```

- [ ] **Step 2: Create the lifecycle controls (client, typed date inputs)**

Create `apps/web/app/(dashboard)/dashboard/orders/[id]/lifecycle-controls.tsx`:

```typescript
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { activate, cancel, pause, resume } from "./actions";

export function LifecycleControls({ orderId, status }: { orderId: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const run = (fn: () => Promise<void>) => start(async () => { await fn(); router.refresh(); });

  return (
    <div className="flex flex-wrap items-center gap-3">
      {status === "waitlisted" && (
        <Button disabled={pending} onClick={() => run(() => activate(orderId))}>Activate</Button>
      )}
      {status === "active" && (
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border bg-transparent px-2 py-1 text-sm" />
          <span className="text-muted-foreground text-sm">to</span>
          <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="rounded-md border bg-transparent px-2 py-1 text-sm" />
          <Button variant="secondary" disabled={pending || !from || !until} onClick={() => run(() => pause(orderId, { from, until }))}>Pause</Button>
        </div>
      )}
      {status === "paused" && (
        <Button disabled={pending} onClick={() => run(() => resume(orderId))}>Resume</Button>
      )}
      {status !== "cancelled" && (
        <Button variant="destructive" disabled={pending} onClick={() => run(() => cancel(orderId))}>Cancel</Button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create the detail page (server)**

Create `apps/web/app/(dashboard)/dashboard/orders/[id]/page.tsx`. Reuse the meals grid from `meals/meals-grid.tsx` and `buildMealsGrid`. Note the `MealsGrid` client component's `pickDish` import points at `meals/actions.ts` and revalidates `/dashboard/meals` — that's acceptable (the page calls `router.refresh()` semantics via revalidate; the order page will reflect changes on navigation). Mirror inquiry detail layout:

```typescript
import { notFound } from "next/navigation";
import { PackageIcon } from "lucide-react";
import { NotFoundError } from "@tiffin/commons";
import { requireStaff } from "@/lib/auth/guards";
import { readOrder, listOrderActivities } from "@/lib/services/orders.service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { buildMealsGrid } from "@/lib/menu/meals-grid";
import { deliveryFrequencies } from "@/db/schema";
import { db } from "@/db/client";
import { eq } from "drizzle-orm";
import { formatEpoch } from "@/lib/format/datetime";
import { PageShell, PageHeader, SectionCard, ListRow, OrderStatusBadge } from "@/components/ds";
import { MealsGrid } from "../../meals/meals-grid";
import { LifecycleControls } from "./lifecycle-controls";

const fmt = (n: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);

function describe(a: { type: string; note: string | null; fromStatus: string | null; toStatus: string | null }) {
  switch (a.type) {
    case "created": return "Order created";
    case "activated": return "Activated";
    case "paused": return "Paused";
    case "resumed": return "Resumed";
    case "cancelled": return "Cancelled";
    case "status_change": return `Status: ${a.fromStatus} → ${a.toStatus}`;
    default: return a.note ?? a.type;
  }
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;

  let order;
  try {
    order = await readOrder(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const activities = await listOrderActivities(order.id);
  const settings = await getAppSettings();

  // Build coming-week meals grid for this order (needs frequencyKey).
  const grid = await buildMealsGrid(
    {
      id: order.id, publicId: order.publicId, planId: order.planId, persons: order.persons,
      mealSlots: order.mealSlots, includeSaturday: order.includeSaturday, includeSunday: order.includeSunday,
      startDate: order.startDate, durationWeeks: order.durationWeeks, frequencyKey: order.frequencyKey,
      pausedFrom: order.pausedFrom, pausedUntil: order.pausedUntil,
    },
    settings,
  );

  return (
    <PageShell>
      <PageHeader icon={PackageIcon} title={order.fullName} breadcrumbOverrides={{ [order.publicId]: order.fullName }} />

      <SectionCard title="Summary">
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-3">
            <OrderStatusBadge status={order.status} />
            <span className="text-muted-foreground">{order.deploymentId}</span>
          </div>
          <p><span className="text-muted-foreground">Plan: </span>{order.planName} · {order.mealSizeName} · {order.frequencyKey}</p>
          <p><span className="text-muted-foreground">Schedule: </span>start {order.startDate} · {order.durationWeeks} weeks · {order.persons} person(s) · {order.mealSlots.join(", ")}</p>
          {order.status === "paused" && order.pausedFrom && (
            <p><span className="text-muted-foreground">Paused: </span>{order.pausedFrom} → {order.pausedUntil}</p>
          )}
          <p><span className="text-muted-foreground">Address: </span>{order.addressLine}, {order.city} {order.postalCode}</p>
          <p><span className="text-muted-foreground">Total: </span>{fmt(Number(order.total))} · Payments: {order.payments.map((p) => fmt(Number(p.amount))).join(", ") || "none"}</p>
        </div>
      </SectionCard>

      <SectionCard title="Lifecycle">
        <LifecycleControls orderId={order.publicId} status={order.status} />
      </SectionCard>

      <SectionCard title="Coming week meals">
        {grid.empty === "no-week" ? (
          <p className="text-muted-foreground text-sm">The coming week's menu hasn't been published yet.</p>
        ) : grid.empty === "no-dates" ? (
          <p className="text-muted-foreground text-sm">No deliveries scheduled for the coming week on this order.</p>
        ) : (
          <MealsGrid
            orderId={order.publicId}
            menuWeekId={grid.releasedWeek.publicId}
            grid={grid.grid}
            persons={grid.persons}
            weekDates={grid.weekDatesView}
            enabledSlots={grid.enabledSlots}
            timezone={settings.timezone}
          />
        )}
      </SectionCard>

      <SectionCard title="Activity">
        <div className="space-y-2">
          {activities.map((a) => (
            <ListRow key={a.publicId} title={describe(a)} meta={formatEpoch(a.createdAt, { mode: "datetime" })} />
          ))}
        </div>
      </SectionCard>
    </PageShell>
  );
}
```

(The unused `deliveryFrequencies`/`db`/`eq` imports above are not needed — remove them; they were a leftover. Keep only the imports actually referenced.)

- [ ] **Step 4: Make `pickDish` revalidate the order page**

In `apps/web/app/(dashboard)/dashboard/meals/actions.ts`, after `revalidatePath("/dashboard/meals")` (line 42), add a revalidate for the order route so staff edits reflect immediately:

```typescript
  revalidatePath(`/dashboard/orders/${input.orderId}`);
```

- [ ] **Step 5: Verify typecheck + render**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors. Then `pnpm dev`: open an order from the list. Confirm summary, lifecycle buttons (conditional on status), meals grid (or empty message), and activity timeline render. As admin, activate a waitlisted order and confirm status + a new activity row appear.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(dashboard)/dashboard/orders/[id]" "apps/web/app/(dashboard)/dashboard/meals/actions.ts"
git commit -m "feat(orders): order detail page with lifecycle, meals oversight, activity log"
```

---

### Task 8: Customers list page

**Files:**
- Modify: `apps/web/lib/services/users.service.ts` (add a customers query) OR inline in the page — see Step 1
- Create: `apps/web/app/(dashboard)/dashboard/customers/page.tsx`
- Create: `apps/web/app/(dashboard)/dashboard/customers/customers-list.tsx`

**Interfaces:**
- Produces: `/dashboard/customers` route listing role=`user` customers with order counts + latest status. Each row links to `/dashboard/customers/[id]`.

- [ ] **Step 1: Create the customers list page (server)**

Create `apps/web/app/(dashboard)/dashboard/customers/page.tsx`. Query users with `role = 'user'`, left-join order aggregates:

```typescript
import { UsersIcon } from "lucide-react";
import { desc, eq, sql } from "drizzle-orm";
import { requireStaff } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { orders, users } from "@/db/schema";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { CustomersList } from "./customers-list";

export default async function CustomersPage() {
  await requireStaff();
  const rows = await db
    .select({
      publicId: users.publicId,
      email: users.email,
      phone: users.phone,
      orderCount: sql<number>`count(${orders.id})`.mapWith(Number),
      latestStatus: sql<string | null>`(array_agg(${orders.status} order by ${orders.createdAt} desc))[1]`,
    })
    .from(users)
    .leftJoin(orders, eq(orders.userId, users.id))
    .where(eq(users.role, "user"))
    .groupBy(users.id, users.publicId, users.email, users.phone)
    .orderBy(desc(sql`count(${orders.id})`))
    .limit(500);

  return (
    <PageShell>
      <PageHeader icon={UsersIcon} title="Customers" subtitle={`${rows.length} total`} />
      <SectionCard title="All customers" subtitle={rows.length === 0 ? "Nothing yet" : undefined}>
        <CustomersList rows={rows} />
      </SectionCard>
    </PageShell>
  );
}
```

(Confirm `users` table has `email`, `phone`, `role` columns — `db/schema/auth.ts`. If `phone` is nullable, the type is `string | null`; adjust the row type accordingly.)

- [ ] **Step 2: Create the client list**

Create `apps/web/app/(dashboard)/dashboard/customers/customers-list.tsx`:

```typescript
"use client";

import { useState } from "react";
import { UsersIcon } from "lucide-react";
import { FilterBar, SearchInput, ListRow, OrderStatusBadge, EmptyState } from "@/components/ds";

type Row = { publicId: string; email: string; phone: string | null; orderCount: number; latestStatus: string | null };

export function CustomersList({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");
  const q = search.toLowerCase();
  const filtered = rows.filter((r) => !q || r.email.toLowerCase().includes(q) || (r.phone ?? "").includes(q));

  return (
    <div className="space-y-4">
      <FilterBar search={<SearchInput value={search} onChange={setSearch} placeholder="Search customers…" />} filters={null} />
      {filtered.length === 0 ? (
        <EmptyState icon={UsersIcon} message="No customers match your search." />
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <ListRow
              key={c.publicId}
              title={c.email}
              meta={`${c.phone ?? "no phone"} · ${c.orderCount} order(s)`}
              trailing={c.latestStatus ? <OrderStatusBadge status={c.latestStatus} /> : undefined}
              href={`/dashboard/customers/${c.publicId}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

(Confirm `FilterBar` accepts `filters={null}`; if not, omit the `filters` prop or pass `<></>`. Match the `FilterBar` prop contract from `apps/web/components/ds/filter-bar.tsx`.)

- [ ] **Step 3: Verify typecheck + render**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors. `pnpm dev`: `/dashboard/customers` lists role=user accounts with order counts; search works; rows link to 360 (404 until Task 9).

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(dashboard)/dashboard/customers/page.tsx" "apps/web/app/(dashboard)/dashboard/customers/customers-list.tsx"
git commit -m "feat(customers): customers list page (role=user) with order counts"
```

---

### Task 9: Customer-360 — service matcher (TDD) + page

**Files:**
- Modify: `apps/web/lib/services/orders.service.ts` (add `customer360`) OR new `apps/web/lib/services/customers.service.ts` (create — preferred, keeps orders.service focused)
- Test: `apps/web/lib/services/__tests__/customer360.service.test.ts` (create)
- Create: `apps/web/app/(dashboard)/dashboard/customers/[id]/page.tsx`

**Interfaces:**
- Produces (in `customers.service.ts`):
  - `getCustomer360(userPublicId: string): Promise<{ profile: { publicId: string; email: string; phone: string | null }; orders: OrderListRow[]; inquiries: { publicId: string; fullName: string; stage: string; source: string; createdAt: number }[]; timeline: { kind: "order" | "inquiry"; label: string; at: number }[] }>`. Inquiries matched by case-insensitive phone OR email equality against the user. Throws `NotFoundError` if the user is missing or not role `user`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/services/__tests__/customer360.service.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { users, inquiries, orders, payments, orderActivities, inquiryActivities } = await import("@/db/schema");
const { getCustomer360 } = await import("../customers.service");

async function reset() {
  await db.delete(orderActivities);
  await db.delete(inquiryActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(inquiries);
  await db.delete(users);
}

describe("getCustomer360 (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("matches inquiries by case-insensitive email/phone", async () => {
    const [u] = await db.insert(users).values({
      email: "match@example.com", phone: "+16475559999", role: "user", passwordHash: "x",
    }).returning({ publicId: users.publicId });
    await db.insert(inquiries).values({ fullName: "Match Person", phone: "+16475559999", email: "OTHER@x.com", source: "manual", stage: "new" });
    await db.insert(inquiries).values({ fullName: "Email Match", phone: "+10000000000", email: "MATCH@example.com", source: "manual", stage: "new" });
    await db.insert(inquiries).values({ fullName: "No Match", phone: "+19999999999", email: "no@x.com", source: "manual", stage: "new" });

    const result = await getCustomer360(u.publicId);
    expect(result.profile.email).toBe("match@example.com");
    const names = result.inquiries.map((i) => i.fullName).sort();
    expect(names).toEqual(["Email Match", "Match Person"]);
  });
});
```

(Confirm the `users` insert columns — `passwordHash` field name and whether `email`/`phone` are required — against `db/schema/auth.ts`; adjust the insert values to satisfy NOT NULL columns. The order-creation path in earlier tests provisions users via `createOrder`; reuse that if direct insert is awkward.)

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/services/__tests__/customer360.service.test.ts`
Expected: FAIL — `customers.service` / `getCustomer360` missing.

- [ ] **Step 3: Implement `customers.service.ts`**

Create `apps/web/lib/services/customers.service.ts`:

```typescript
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { NotFoundError } from "@tiffin/commons";
import { db } from "@/db/client";
import { inquiries, orders, users } from "@/db/schema";
import { listOrders, type OrderListRow } from "./orders.service";

export async function getCustomer360(userPublicId: string) {
  const [user] = await db
    .select({ id: users.id, publicId: users.publicId, email: users.email, phone: users.phone, role: users.role })
    .from(users)
    .where(eq(users.publicId, userPublicId))
    .limit(1);
  if (!user || user.role !== "user") throw new NotFoundError("Customer not found");

  // Their orders (reuse listOrders shape, filtered to this user via deploymentId search is not enough — query directly).
  const orderRows = await db
    .select({
      publicId: orders.publicId, deploymentId: orders.deploymentId, fullName: orders.fullName,
      city: orders.city, planKey: sql<string>`''`, status: orders.status, startDate: orders.startDate,
      total: orders.total, createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.userId, user.id))
    .orderBy(desc(orders.createdAt));

  // Inquiries matched by case-insensitive email OR phone.
  const matchConds = [];
  if (user.email) matchConds.push(ilike(inquiries.email, user.email));
  if (user.phone) matchConds.push(eq(sql`lower(${inquiries.phone})`, user.phone.toLowerCase()));
  const inqRows = matchConds.length
    ? await db
        .select({ publicId: inquiries.publicId, fullName: inquiries.fullName, stage: inquiries.stage, source: inquiries.source, createdAt: inquiries.createdAt })
        .from(inquiries)
        .where(or(...matchConds))
        .orderBy(desc(inquiries.createdAt))
    : [];

  const timeline = [
    ...orderRows.map((o) => ({ kind: "order" as const, label: `Order ${o.deploymentId} (${o.status})`, at: o.createdAt })),
    ...inqRows.map((i) => ({ kind: "inquiry" as const, label: `Inquiry from ${i.fullName} (${i.stage})`, at: i.createdAt })),
  ].sort((a, b) => b.at - a.at);

  return {
    profile: { publicId: user.publicId, email: user.email, phone: user.phone },
    orders: orderRows as OrderListRow[],
    inquiries: inqRows,
    timeline,
  };
}
```

Note: `planKey` is stubbed `''` here to keep the query simple; if the 360 page should show plan names, join `plans` as in `listOrders`. The `and` import is unused — remove it. `listOrders`/`OrderListRow` import: keep only `OrderListRow` (type) if `listOrders` isn't called.

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/services/__tests__/customer360.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the 360 page (server)**

Create `apps/web/app/(dashboard)/dashboard/customers/[id]/page.tsx`:

```typescript
import { notFound } from "next/navigation";
import { UsersIcon } from "lucide-react";
import { NotFoundError } from "@tiffin/commons";
import { requireStaff } from "@/lib/auth/guards";
import { getCustomer360 } from "@/lib/services/customers.service";
import { formatEpoch } from "@/lib/format/datetime";
import { PageShell, PageHeader, SectionCard, ListRow, OrderStatusBadge, EmptyState } from "@/components/ds";

export default async function Customer360Page({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;

  let data;
  try {
    data = await getCustomer360(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  return (
    <PageShell>
      <PageHeader icon={UsersIcon} title={data.profile.email} breadcrumbOverrides={{ [data.profile.publicId]: data.profile.email }} />

      <SectionCard title="Profile">
        <p className="text-sm text-muted-foreground">{data.profile.phone ?? "no phone"} · {data.profile.email}</p>
      </SectionCard>

      <SectionCard title="Orders">
        {data.orders.length === 0 ? (
          <EmptyState icon={UsersIcon} message="No orders for this customer." />
        ) : (
          <div className="space-y-2">
            {data.orders.map((o) => (
              <ListRow key={o.publicId} title={o.deploymentId} meta={`${o.city} · start ${o.startDate}`} trailing={<OrderStatusBadge status={o.status} />} href={`/dashboard/orders/${o.publicId}`} />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Inquiries">
        {data.inquiries.length === 0 ? (
          <p className="text-muted-foreground text-sm">No matching inquiries.</p>
        ) : (
          <div className="space-y-2">
            {data.inquiries.map((i) => (
              <ListRow key={i.publicId} title={i.fullName} meta={`${i.source} · ${i.stage}`} href={`/dashboard/inquiries/${i.publicId}`} />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Activity timeline">
        <div className="space-y-2">
          {data.timeline.map((t, idx) => (
            <ListRow key={idx} title={t.label} meta={formatEpoch(t.at, { mode: "datetime" })} />
          ))}
        </div>
      </SectionCard>
    </PageShell>
  );
}
```

- [ ] **Step 6: Verify typecheck + render**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors. `pnpm dev`: open a customer; confirm profile, orders, matched inquiries, merged timeline render.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/services/customers.service.ts apps/web/lib/services/__tests__/customer360.service.test.ts "apps/web/app/(dashboard)/dashboard/customers/[id]/page.tsx"
git commit -m "feat(customers): customer-360 page aggregating orders, inquiries, timeline"
```

---

### Task 10: Sidebar navigation — Orders + Customers

**Files:**
- Modify: `apps/web/components/dashboard/app-sidebar.tsx:46-77`

**Interfaces:**
- Consumes: nothing new.
- Produces: "Orders" + "Customers" links in the Operations section.

- [ ] **Step 1: Add nav items**

In `apps/web/components/dashboard/app-sidebar.tsx`, add `PackageIcon` to the lucide import block (line 3–15) and extend the Operations section `items` array (after the Inquiries item, ~line 51):

```typescript
      { title: "Orders", href: "/dashboard/orders", icon: PackageIcon, roles: ["admin", "member"] },
      { title: "Customers", href: "/dashboard/customers", icon: UsersIcon, roles: ["admin", "member"] },
```

(`UsersIcon` is already imported. Add `PackageIcon` to the import list.)

- [ ] **Step 2: Verify render**

Run: `cd apps/web && pnpm typecheck` then `pnpm dev`.
Expected: sidebar Operations group shows Overview, Inquiries, Orders, Customers; each navigates correctly; active-state highlighting works (the `isActive` prefix match already handles nested routes).

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/dashboard/app-sidebar.tsx
git commit -m "feat(dashboard): add Orders + Customers nav to Operations"
```

---

### Task 11: Full-suite gate + reseed

**Files:** none (verification task).

- [ ] **Step 1: Run the full test suite**

Run: `cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run`
Expected: PASS. Known flake: `next-id.test.ts` may fail under full-suite load — if that is the ONLY failure, the gate is green.

- [ ] **Step 2: Reseed the dev DB**

Run:
```bash
cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:seed && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:seed:catalog && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:seed:menu && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:seed:admin
```
Expected: seeds complete; dev DB repopulated.

- [ ] **Step 3: Final manual smoke (run the app)**

`pnpm dev`, as admin: Orders list → open order → activate/pause/resume/cancel → confirm status + activity log update and meals grid edits persist; Customers list → open a customer → 360 aggregates correctly.

---

## Self-Review

**Spec coverage:**
- A (list + detail): Tasks 3, 6, 7. ✓
- B (lifecycle + paused enum + pause window): Tasks 1, 2, 4, 7. ✓
- C (meal-pick oversight): Tasks 5, 7 (reuses staff-gated `pickDish`). ✓
- D (customer-360): Tasks 8, 9. ✓
- `order_activities` audit table: Task 1; written by Task 4. ✓
- Nav: Task 10. ✓
- Testing + reseed: Tasks 2,3,4,9 (unit/integration) + Task 11 (gate). ✓

**Known corrections baked in:** `orders` has no `phone` column — Task 3 Step 3 corrects the list row/search to `fullName` + `deploymentId` (+ city). Leftover/unused imports are flagged for removal in Tasks 3, 7, 9.

**Open verification points for the implementer (confirm against code, adjust inline):**
- `users` insert column names in Task 9 test (`passwordHash` vs other) — verify `db/schema/auth.ts`.
- `FilterBar` prop contract (`filters` accepting array/null) — verify `components/ds/filter-bar.tsx`.
- `pnpm typecheck` script existence — fall back to the repo's type-check command if named differently.
- `mealSizes.name` / `plans.name` column names — verify `db/schema/catalog.ts`.
</content>
</invoke>
