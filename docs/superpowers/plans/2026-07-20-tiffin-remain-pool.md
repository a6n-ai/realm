# Tiffin Remain Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show total/remaining tiffins on `/me/deliveries`, move post-cutoff misses into a remain pool (no auto-makeup dates), let customers schedule pool tiffins after the last delivery on plan weekdays, and support vacation resume-from a chosen date.

**Architecture:** Order-level `pooled_tiffin_count` + optional `deliveries.pooled_at` for idempotent miss accounting. Replace `reconcileMakeups` date creation with `reconcilePoolFromMisses`. Customer schedules via `scheduleFromPool`. Resume accepts `resumeFromDate` and pools past vacation misses.

**Tech Stack:** Next.js 16 (`apps/tiffin-grab`), Drizzle ORM + `pnpm --filter tiffin-grab db:generate` / `db:migrate`, Vitest, existing `VacationControl` / `SubscriptionPlanSummary` patterns.

**Spec:** `docs/superpowers/specs/2026-07-20-tiffin-remain-pool-design.md`

## Global Constraints

- Remaining = `tiffin_count − delivered_tiffins` (tiffins, not days); each delivery **day** = `orders.persons` tiffins.
- Pool dates only **after** `max(delivery_date)`; weekday must be in `orderDeliveryDays(...)`.
- Pre-cutoff: skip/unskip and vacation restore still work; post-cutoff → pool once (idempotent).
- Do **not** change `tiffin_count` / pricing; leave existing makeup rows in prod as scheduled.
- Pause budgets unchanged; scheduling from pool does not consume them.
- Pricing/totals stay server-side; audit from session where applicable.
- Work on a feature branch off current work; keep meals-week Monday fix out of these commits unless already merged.

## File map

| File | Responsibility |
|------|----------------|
| `db/schema/orders.ts` | Add `pooledTiffinCount` |
| `db/schema/deliveries.ts` | Add `pooledAt` (idempotent miss mark) |
| `db/migrations/0006_*.sql` | Generated migration |
| `lib/services/tiffin-counts.ts` | **New** pure helpers: delivered/remaining/pool math |
| `lib/services/deliveries.service.ts` | `reconcilePoolFromMisses`, `scheduleFromPool`; stop creating makeup dates |
| `lib/services/orders.service.ts` | `resume(publicId, { fromDate }, actorId)` |
| `lib/services/customer-deliveries.service.ts` | Expose counts + frequency days on `Subscription` |
| `workers/reconcile-deliveries.ts` | Call pool reconcile |
| `app/(customer)/me/deliveries/actions.ts` | `scheduleMyPoolTiffin`, `resumeMySubscription(…, fromDate)` |
| `subscription-items.tsx` | Header Total / Remaining / To schedule |
| `vacation-control.tsx` + `vacation-pause.ts` | Resume-from date |
| `schedule-pool-control.tsx` | **New** client UI to pick pool date |
| `delivery-calendar.tsx` / `page.tsx` | Wire counts + schedule control |
| Tests under `lib/services/__tests__/` and `app/(customer)/me/deliveries/__tests__/` | |

---

### Task 1: Schema — `pooled_tiffin_count` + `pooled_at`

**Files:**
- Modify: `apps/tiffin-grab/db/schema/orders.ts`
- Modify: `apps/tiffin-grab/db/schema/deliveries.ts`
- Create: `apps/tiffin-grab/db/migrations/0006_*.sql` (via drizzle-kit)
- Test: migration applies cleanly (`pnpm --filter tiffin-grab db:migrate`)

**Interfaces:**
- Produces: `orders.pooledTiffinCount: number` (default 0); `deliveries.pooledAt: number | null`

- [ ] **Step 1: Add columns to schema**

In `orders.ts`, after `tiffinCount`:

```ts
pooledTiffinCount: integer("pooled_tiffin_count").notNull().default(0),
```

In `deliveries.ts`, after `makeupForDeliveryId`:

```ts
// Set once when this miss's tiffins were added to orders.pooled_tiffin_count (idempotent reconcile).
pooledAt: bigint("pooled_at", { mode: "number" }),
```

- [ ] **Step 2: Generate and apply migration**

```bash
pnpm --filter tiffin-grab db:generate
pnpm --filter tiffin-grab db:migrate
```

Expected: new `0006_*.sql` with `ALTER TABLE orders ADD pooled_tiffin_count…` and `ALTER TABLE deliveries ADD pooled_at…`.

- [ ] **Step 3: Commit**

```bash
git add apps/tiffin-grab/db/schema/orders.ts apps/tiffin-grab/db/schema/deliveries.ts apps/tiffin-grab/db/migrations
git commit -m "feat(db): add pooled tiffin count and delivery pooled_at"
```

---

### Task 2: Pure tiffin count helpers (TDD)

**Files:**
- Create: `apps/tiffin-grab/lib/services/tiffin-counts.ts`
- Create: `apps/tiffin-grab/lib/services/__tests__/tiffin-counts.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type DeliveryForCounts = {
    status: "scheduled" | "paused" | "skipped" | "cancelled";
    cutoffAt: number;
    makeupForDeliveryId: bigint | null;
    pooledAt: number | null;
  };

  export function deliveredTiffinCount(
    persons: number,
    rows: DeliveryForCounts[],
    nowMs: number,
  ): number;

  export function remainingTiffinCount(
    tiffinCount: number,
    persons: number,
    rows: DeliveryForCounts[],
    nowMs: number,
  ): number;
  // remaining === tiffinCount - deliveredTiffinCount(...)
  ```

**Counting rules (lock these in tests):**
- A day **consumes** (delivered) when `cutoffAt <= now` AND `status === "scheduled"` (includes makeups that are still `scheduled`).
- `paused` / `skipped` / `cancelled` never count as delivered (even past cutoff) — entitlement is in pool or void.
- Each qualifying day contributes `persons` tiffins.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { deliveredTiffinCount, remainingTiffinCount } from "../tiffin-counts";

const past = 1;
const future = Date.now() + 1e9;

describe("tiffin-counts", () => {
  it("counts past-cutoff scheduled days × persons as delivered", () => {
    const rows = [
      { status: "scheduled" as const, cutoffAt: past, makeupForDeliveryId: null, pooledAt: null },
      { status: "scheduled" as const, cutoffAt: future, makeupForDeliveryId: null, pooledAt: null },
    ];
    expect(deliveredTiffinCount(2, rows, Date.now())).toBe(2);
    expect(remainingTiffinCount(10, 2, rows, Date.now())).toBe(8);
  });

  it("does not count past-cutoff skipped/paused as delivered", () => {
    const rows = [
      { status: "skipped" as const, cutoffAt: past, makeupForDeliveryId: null, pooledAt: 1 },
      { status: "paused" as const, cutoffAt: past, makeupForDeliveryId: null, pooledAt: 1 },
    ];
    expect(deliveredTiffinCount(1, rows, Date.now())).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm --filter tiffin-grab exec vitest run lib/services/__tests__/tiffin-counts.test.ts
```

- [ ] **Step 3: Implement `tiffin-counts.ts`**

```ts
export type DeliveryForCounts = {
  status: "scheduled" | "paused" | "skipped" | "cancelled";
  cutoffAt: number;
  makeupForDeliveryId: bigint | null;
  pooledAt: number | null;
};

export function deliveredTiffinCount(
  persons: number,
  rows: DeliveryForCounts[],
  nowMs: number,
): number {
  let days = 0;
  for (const r of rows) {
    if (r.status !== "scheduled") continue;
    if (r.cutoffAt > nowMs) continue;
    days += 1;
  }
  return days * persons;
}

export function remainingTiffinCount(
  tiffinCount: number,
  persons: number,
  rows: DeliveryForCounts[],
  nowMs: number,
): number {
  return tiffinCount - deliveredTiffinCount(persons, rows, nowMs);
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/tiffin-grab/lib/services/tiffin-counts.ts apps/tiffin-grab/lib/services/__tests__/tiffin-counts.test.ts
git commit -m "feat: pure helpers for delivered/remaining tiffin counts"
```

---

### Task 3: `reconcilePoolFromMisses` replaces makeup date creation

**Files:**
- Modify: `apps/tiffin-grab/lib/services/deliveries.service.ts`
- Modify: `apps/tiffin-grab/lib/services/__tests__/deliveries-skip.test.ts` (and any makeup-creation assertions)
- Modify: `apps/tiffin-grab/workers/reconcile-deliveries.ts`
- Modify: `apps/tiffin-grab/workers/__tests__/reconcile-deliveries.test.ts`

**Interfaces:**
- Produces: `export async function reconcilePoolFromMisses(orderId: bigint): Promise<number>` — returns tiffins added to pool this run.
- Change: every former `await reconcileMakeups(...)` call site → `await reconcilePoolFromMisses(...)`.
- Keep `reconcileMakeups` as a thin deprecated alias that calls `reconcilePoolFromMisses` **or** delete and fix all imports (prefer delete + fix imports).
- Behavior: for each original miss (`paused|skipped`, `cutoffAt <= now`, `makeupForDeliveryId IS NULL`, `pooledAt IS NULL`): set `pooledAt = Date.now()`, add `orders.persons` to `orders.pooledTiffinCount`. Do **not** insert delivery rows. Skip rows that already have a makeup child (legacy): leave them; do not pool (entitlement already on calendar).

- [ ] **Step 1: Write failing test — skip past cutoff pools, no new date**

Extend skip tests (mirror existing seed helpers in `deliveries-skip.test.ts`):

```ts
it("reconcilePoolFromMisses increments pool and does not insert a makeup date", async () => {
  // seed order persons=1, one skipped row with cutoffAt in the past, no makeup
  const before = await countDeliveries(orderId);
  const added = await reconcilePoolFromMisses(orderId);
  expect(added).toBe(1);
  const after = await countDeliveries(orderId);
  expect(after).toBe(before);
  const [ord] = await db.select().from(orders).where(eq(orders.id, orderId));
  expect(ord.pooledTiffinCount).toBe(1);
  // second run idempotent
  expect(await reconcilePoolFromMisses(orderId)).toBe(0);
  expect((await db.select().from(orders).where(eq(orders.id, orderId)))[0].pooledTiffinCount).toBe(1);
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement `reconcilePoolFromMisses`**

Inside advisory-locked transaction:

1. Load order; bail if cancelled/completed.
2. Select misses: original, paused|skipped, cutoff passed, `pooledAt` null, **and** no existing makeup child (same leftJoin as today).
3. For each miss: `UPDATE deliveries SET pooled_at = now WHERE id = ? AND pooled_at IS NULL`; if row updated, `UPDATE orders SET pooled_tiffin_count = pooled_tiffin_count + persons`.
4. Return total tiffins added.

Replace call sites in `skipDelivery`, `pauseRange` path, `resumeOrder` (deliveries), `unskip` if any, and worker.

- [ ] **Step 4: Update worker**

`workers/reconcile-deliveries.ts`: same order discovery query but also allow `pooledAt IS NULL` (and keep no-makeup join). Call `reconcilePoolFromMisses`.

- [ ] **Step 5: Fix broken makeup-creation tests** — assert pool instead of new row where appropriate; keep a test that **legacy makeup row still allowed** if already present.

- [ ] **Step 6: Run**

```bash
pnpm --filter tiffin-grab exec vitest run lib/services/__tests__/deliveries-skip.test.ts workers/__tests__/reconcile-deliveries.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(deliveries): pool post-cutoff misses instead of auto-makeup dates"
```

---

### Task 4: `scheduleFromPool`

**Files:**
- Modify: `apps/tiffin-grab/lib/services/deliveries.service.ts`
- Create: `apps/tiffin-grab/lib/services/__tests__/schedule-from-pool.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export async function scheduleFromPool(
    orderPublicId: string,
    dateIso: string,
    actorId: bigint | null,
  ): Promise<{ deliveryPublicId: string }>;
  ```
- Errors (`ValidationError` messages exact):
  - `"No tiffins left to schedule"`
  - `"Date must be after your last delivery"`
  - `"That day isn't on your plan"`

- [ ] **Step 1: Failing tests**

```ts
it("rejects date on or before last delivery", async () => { /* … */ });
it("rejects weekday not in orderDeliveryDays", async () => { /* … */ });
it("rejects when pool < persons", async () => { /* … */ });
it("inserts scheduled row after last date and decrements pool by persons", async () => {
  // pool=2, persons=2 → after: pool=0, one new scheduled day
});
```

Use `orderDeliveryDays` + `weekdayKey(parseIsoDateUtc(dateIso))` for weekday check. Use existing `cutoffMsFor` + `getAppSettings` for `cutoffAt`. Optionally set `makeupForDeliveryId` to oldest unpooled-linked miss with `pooledAt` set and no makeup yet — **YAGNI for v1: leave null** unless a test requires audit link; spec says optional.

- [ ] **Step 2: Implement**

Advisory lock on order id. Re-read `pooledTiffinCount` and `persons`. Validate date > max(delivery_date). Validate weekday. Insert delivery. Decrement pool by persons. Activity type: reuse `"scheduled"` or insert a descriptive activity if schema allows — if only fixed enum, use existing closest type or skip activity (check `orderActivities` types); prefer an existing type or add `"pool_scheduled"` only if enum is easy to extend in same migration task (otherwise skip activity in v1).

- [ ] **Step 3: Tests PASS + commit**

```bash
git commit -m "feat(deliveries): schedule tiffins from remain pool after last delivery"
```

---

### Task 5: Vacation `resume` with `fromDate`

**Files:**
- Modify: `apps/tiffin-grab/lib/services/orders.service.ts` (`resume`)
- Modify: `apps/tiffin-grab/lib/services/deliveries.service.ts` (`resumeOrder` → accept `fromDate`)
- Modify: `apps/tiffin-grab/lib/services/__tests__/orders.service.test.ts` (or new resume-from test)
- Modify: `apps/tiffin-grab/app/(customer)/me/deliveries/actions.ts`

**Interfaces:**
- Produces:
  ```ts
  // orders.service
  async resume(publicId: string, opts?: { fromDate?: string }, actorId?: bigint): Promise<void>
  // deliveries.service
  export async function resumeOrder(orderPublicId: string, fromDate?: string): Promise<number>
  // actions
  export async function resumeMySubscription(orderPublicId: string, fromDate: string)
  ```

**Behavior:**
1. Fix partial-pause: if `hasOpenPause` and status is `active`, still allow resume when `fromDate` provided (close pause row + unpause rows ≥ fromDate). Keep conditional order flip when status is `paused`.
2. `resumeOrder(publicId, fromDate)`: unpause rows where `status=paused` AND `cutoffAt > now` AND `deliveryDate >= fromDate` (if fromDate set; else all future as today).
3. After unpause, call `reconcilePoolFromMisses` so vacation days already past cutoff enter the pool.
4. `autoResumeIfElapsed`: when auto-closing, pass `fromDate = today` (app TZ ISO date) so past days pool correctly.

- [ ] **Step 1: Failing test** — pause Mon–Fri, advance clock / set cutoffs so Mon–Tue past cutoff, resume from Wednesday → Wed+ scheduled; Mon–Tue pooled.

- [ ] **Step 2: Implement + wire action**

```ts
export async function resumeMySubscription(orderPublicId: string, fromDate: string) {
  const userId = await me();
  await assertOwnsOrder(userId, orderPublicId);
  await resumeOrder(orderPublicId, { fromDate }, userId);
  revalidatePath("/me/deliveries");
}
```

Adjust `resumeOrder` export signature carefully — customer actions import from `orders.service`; keep named export compatible.

- [ ] **Step 3: Tests PASS + commit**

```bash
git commit -m "feat(orders): vacation resume from chosen date pools past misses"
```

---

### Task 6: Expose counts on customer `Subscription`

**Files:**
- Modify: `apps/tiffin-grab/lib/services/customer-deliveries.service.ts`
- Modify: any tests that construct `Subscription`

**Interfaces:**
- Extends `Subscription`:
  ```ts
  tiffinCount: number;
  pooledTiffinCount: number;
  deliveredTiffinCount: number;
  remainingTiffinCount: number;
  frequencyKey: string;
  includeSaturday: boolean;
  includeSunday: boolean;
  ```
- Load all visible deliveries for each active order (or one query) and compute via `tiffin-counts` helpers. Include `pooledTiffinCount` from the order row.

- [ ] **Step 1: Extend select in `myActiveSubscriptions`** — join frequency; select `tiffinCount`, `pooledTiffinCount`, sat/sun flags; fetch deliveries for those order ids; compute delivered/remaining.

- [ ] **Step 2: Smoke test or unit test with mocked rows**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(customer): expose tiffin total/remaining/pool on subscriptions"
```

---

### Task 7: UI — plan header counts

**Files:**
- Modify: `apps/tiffin-grab/app/(customer)/me/deliveries/subscription-items.tsx`

- [ ] **Step 1: Extend `SubscriptionPlanSummary`**

After the meal-size line, add a second line (muted, same typography):

```tsx
<p className="text-muted-foreground text-sm">
  Total {sub.tiffinCount} · Remaining {sub.remainingTiffinCount}
  {sub.pooledTiffinCount > 0 ? ` · To schedule ${sub.pooledTiffinCount}` : ""}
</p>
```

Use the word **tiffins** in copy if space allows: `Total 20 tiffins · Remaining 14 · To schedule 2`.

- [ ] **Step 2: Manual check / lightweight RTL test if existing pattern**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(customer): show total and remaining tiffins on deliveries header"
```

---

### Task 8: UI — Schedule from pool

**Files:**
- Create: `apps/tiffin-grab/app/(customer)/me/deliveries/schedule-pool-control.tsx`
- Modify: `apps/tiffin-grab/app/(customer)/me/deliveries/actions.ts` — `scheduleMyPoolTiffin`
- Modify: `apps/tiffin-grab/app/(customer)/me/deliveries/delivery-calendar.tsx` — render control when pool &gt; 0
- Reuse: `VacationDateField` or similar date picker; disable dates ≤ last delivery and disallowed weekdays (pass `allowedDow` from `orderDeliveryDays`).

**Interfaces:**
- Action: `scheduleMyPoolTiffin(orderPublicId: string, dateIso: string)`
- Needs `lastDeliveryDateIso` from calendar data (max date of sub’s deliveries) — compute in page/server and pass as prop.

- [ ] **Step 1: Server action**

```ts
export async function scheduleMyPoolTiffin(orderPublicId: string, dateIso: string) {
  const userId = await me();
  await assertOwnsOrder(userId, orderPublicId);
  await scheduleFromPool(orderPublicId, dateIso, userId);
  revalidatePath("/me/deliveries");
}
```

- [ ] **Step 2: Client dialog** — button “Schedule tiffin” when `pooledTiffinCount > 0`; date field; confirm; `router.refresh()`; show server error string.

- [ ] **Step 3: Wire into `DeliveryCalendar` / page header actions next to Vacation**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(customer): schedule remain-pool tiffins after last delivery"
```

---

### Task 9: UI — Vacation resume-from date

**Files:**
- Modify: `apps/tiffin-grab/app/(customer)/me/deliveries/vacation-control.tsx`
- Modify: `apps/tiffin-grab/app/(customer)/me/deliveries/vacation-pause.ts` if helpers help

- [ ] **Step 1: When `onVacation`, show Resume form with required `resumeFrom` date** (default = `today`). Confirm copy: past vacation days move to “To schedule”.

- [ ] **Step 2: Call `resumeMySubscription(sub.publicId, resumeFrom)`**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(customer): vacation resume from chosen date"
```

---

### Task 10: Verification gate

- [ ] **Step 1: Typecheck + targeted tests**

```bash
pnpm --filter tiffin-grab exec tsc --noEmit -p tsconfig.json
pnpm --filter tiffin-grab exec vitest run lib/services/__tests__/tiffin-counts.test.ts lib/services/__tests__/schedule-from-pool.test.ts lib/services/__tests__/deliveries-skip.test.ts workers/__tests__/reconcile-deliveries.test.ts
```

- [ ] **Step 2: Manual acceptance (local or staging)** against spec §5 checklist

- [ ] **Step 3: Open PR** summarizing remain pool + resume-from (separate from meals-week Monday fix if still unmerged)

---

## Spec coverage self-check

| Spec requirement | Task |
|------------------|------|
| Total / remaining display | 2, 6, 7 |
| Post-cutoff → pool, not auto date | 3 |
| Schedule after last delivery + frequency | 4, 8 |
| Resume from date; past → pool | 5, 9 |
| Idempotent reconcile / worker | 3 |
| `pooled_tiffin_count` + mark | 1 |
| Pause budgets unchanged | (no task — leave alone) |
| Legacy makeups untouched | 3 (skip pool if makeup exists) |

## Placeholder / consistency check

- Count rules, error strings, and function names are consistent across tasks (`reconcilePoolFromMisses`, `scheduleFromPool`, `resume(..., { fromDate })`).
- No TBD sections remaining.
