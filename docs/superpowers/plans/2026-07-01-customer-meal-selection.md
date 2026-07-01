# Customer Meal Selection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give subscribers a phone-first meal-selection surface for the coming released week: pick per delivery, "apply to the whole week" in one tap, and clearly see the default dish they'll get if they don't choose.

**Architecture:** Reuse the existing `selectionsService.setSelection` validation for every write. Add a `selectionsService.applyToWeek` that loops a week's delivery dates through `setSelection` and tallies results, a thin `applyDishToWeek` server action, a `GridCell.isDefaulted` flag so the UI can distinguish an explicit pick from a default fallback, and a mobile-first rebuild of the selection UI (stacked per-delivery cards + a dish drawer). Depends on Spec 1 (defaults must be settable).

**Tech Stack:** Next.js (App Router, server actions), Drizzle ORM, Postgres, vitest (live-DB harness), shadcn/ui (Drawer/Sheet), lucide-react, tailwindcss-animate.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-01-customer-meal-selection-design.md`.
- **Mobile-first is a hard requirement.** Customers are mostly on phones. Design the phone layout as the baseline (single column, no horizontal scroll, ≥44px touch targets); widen for `md:`+ as enhancement. A table is allowed only as a `md:`+ enhancement, never the phone default.
- Coming **released** week only. The release gate stays dynamic (`meals-grid.ts:60` requires a `released` `menuWeeks` row) — no hardcoded flag.
- Cutoffs anchor to the delivery timezone, not the viewer. See [[staff-ist-customers-canada]].
- Every write goes through `selectionsService.setSelection` — do not fork its validation (day-membership, per-day cutoff, dish-on-menu, diet). See [[services-extend-commons-convention]].
- No `Co-Authored-By` trailer in commits. See [[no-claude-coauthor-commits]].
- Tests hit the real seeded Postgres; catalog fixtures (`plans`, `mealSlots`, `deliveryFrequencies`) come from the seed and must not be deleted; never delete `usr_system`. See [[live-db-test-harness]].

---

### Task 1: `GridCell.isDefaulted` — surface pick vs default

**Files:**
- Modify: `apps/web/lib/menu/meals-grid.ts:10-18` (type) and `:129-141` (loop)

**Interfaces:**
- Produces: `GridCell` gains `isDefaulted: boolean` — `true` when the cell has no explicit `mealSelection` and `selectedDishId` was filled from the `isDefault` menu item; `false` when the customer picked explicitly or the cell is empty.

> The flag is a one-line derived boolean over logic already present at `:133-139`. A dedicated live-DB test for `buildMealsGrid` would be timing-coupled to `comingWeekStartIso(now)` for low value; it's verified in Task 4's manual check and exercised by Task 2's real test. (ponytail: no heavy integration test for a derived flag.)

- [ ] **Step 1: Add the field to the type**

In `apps/web/lib/menu/meals-grid.ts`, extend `GridCell` (after `selectedDishId`, line 15):

```typescript
export type GridCell = {
  day: DayOfWeek;
  dateIso: string;
  slot: string;
  personIndex: number;
  selectedDishId: string | null;
  isDefaulted: boolean;
  dishes: { id: string; name: string; diet: "veg" | "nonveg" }[];
  locked: boolean;
};
```

- [ ] **Step 2: Set it in the grid loop**

Replace the pick/default block and the push (lines 129-141) with:

```typescript
      for (let p = 1; p <= order.persons; p++) {
        const pick = picks.find(
          (sel) => sel.dayOfWeek === day && sel.slot === slot && sel.personIndex === p,
        );
        let selectedDishId: string | null = null;
        let isDefaulted = false;
        if (pick) {
          selectedDishId = dishPublicIdByBigintId.get(pick.dishId) ?? null;
        } else {
          const defaultItem = slotItems.find((i) => i.isDefault);
          selectedDishId = defaultItem ? (dishPublicIdByBigintId.get(defaultItem.dishId) ?? null) : null;
          isDefaulted = selectedDishId !== null;
        }
        grid.push({ day, dateIso, slot, personIndex: p, selectedDishId, isDefaulted, dishes: slotDishes, locked });
      }
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: no new errors from `meals-grid.ts` (the client component consuming `GridCell` gets its own update in Task 4).

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/menu/meals-grid.ts
git commit -m "feat(meals): expose isDefaulted on grid cells (pick vs default)"
```

---

### Task 2: `selectionsService.applyToWeek` (service + test)

**Files:**
- Modify: `apps/web/lib/menu/selections.service.ts` (add method; add imports)
- Test: `apps/web/lib/menu/__tests__/selections-apply-week.test.ts`

**Interfaces:**
- Consumes: `setSelection` (same object); `deliveryFrequencies`, `orders`, `menuWeeks` schema; `orderDeliveryDays`, `subscriptionDeliveryDates` from `@/lib/menu/*` (already imported in this file).
- Produces:
  `applyToWeek(input: { order: Order; menuWeek: Week; slot: string; personIndex: number; dishPublicId: string }): Promise<{ applied: number; skipped: { dateIso: string; reason: string }[] }>`
  — applies `dishPublicId` to every delivery date of `menuWeek` for that `(slot, personIndex)`, skipping (with a reason) any date `setSelection` rejects (locked, dish-not-on-menu, diet mismatch, not a delivery day).

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/menu/__tests__/selections-apply-week.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, mealSelections, menuItems, menuWeeks, orders, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { selectionsService } = await import("../selections.service");

// A Monday ~8 weeks out so every weekday cutoff is still in the future.
const FUTURE_MONDAY = (() => {
  const d = new Date(Date.now() + 56 * 86400000);
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
})();

let order: typeof orders.$inferSelect;
let week: typeof menuWeeks.$inferSelect;
let vegDishPublicId: string;
let vegDishBigintId: bigint;

async function reset() {
  await db.delete(mealSelections); await db.delete(menuItems); await db.delete(menuWeeks);
  await db.delete(orders); await db.delete(dishes); await db.delete(users).where(ne(users.isSystem, true));
}

function dateInWeek(weekStartIso: string, offset: number) {
  const d = new Date(`${weekStartIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

describe("selectionsService.applyToWeek", () => {
  beforeEach(async () => {
    await reset();
    const snap = await loadCatalogSnapshot();
    const [u] = await db.insert(users).values({ phone: "+16475557100", role: "user" }).returning();
    const [o] = await db.insert(orders).values({
      userId: u.id, planId: snap.plans.find((p) => p.key === "veg")!.id, mealSizeId: snap.mealSizes[0].id,
      frequencyId: snap.frequencies.find((f) => f.key === "5_day")!.id, persons: 1, mealSlots: ["lunch"],
      durationWeeks: 1, startDate: FUTURE_MONDAY, tiffinCount: 5, perTiffinPrice: "10.00",
      pricingSnapshot: {}, total: "50.00", status: "active",
      deploymentId: "SUB-APPLY1", fullName: "T", addressLine: "1", city: "Toronto", postalCode: "M5V 2T6",
    }).returning();
    order = o;
    const [w] = await db.insert(menuWeeks).values({ weekStart: FUTURE_MONDAY, status: "released", orderCutoff: new Date("2999-01-01").getTime() }).returning();
    week = w;
    const [vd] = await db.insert(dishes).values({ name: "Paneer", diet: "veg", slots: ["lunch"] }).returning();
    vegDishPublicId = vd.publicId; vegDishBigintId = vd.id;
    // Offer the dish Mon–Thu (4 of the 5 weekday deliveries); Friday deliberately has no menu item for it.
    for (const day of ["mon", "tue", "wed", "thu"] as const) {
      await db.insert(menuItems).values({ menuWeekId: w.id, dayOfWeek: day, slot: "lunch", dishId: vegDishBigintId, isDefault: false });
    }
  });
  afterAll(reset);

  it("applies to every eligible delivery day and skips days missing the dish", async () => {
    const res = await selectionsService.applyToWeek({ order, menuWeek: week, slot: "lunch", personIndex: 1, dishPublicId: vegDishPublicId });
    expect(res.applied).toBe(4);
    expect(res.skipped.map((s) => s.dateIso)).toContain(dateInWeek(FUTURE_MONDAY, 4)); // Friday skipped
    const rows = await db.select().from(mealSelections).where(eq(mealSelections.orderId, order.id));
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.dishId === vegDishBigintId)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run lib/menu/__tests__/selections-apply-week.test.ts`
Expected: FAIL — `selectionsService.applyToWeek is not a function`.

- [ ] **Step 3: Write the implementation**

In `apps/web/lib/menu/selections.service.ts`, add `applyToWeek` to the exported object (after `setSelection`, before `effectiveSelections`):

```typescript
  async applyToWeek(input: { order: Order; menuWeek: Week; slot: string; personIndex: number; dishPublicId: string }) {
    const { order, menuWeek, slot, personIndex, dishPublicId } = input;

    const [freq] = await db.select({ key: deliveryFrequencies.key }).from(deliveryFrequencies).where(eq(deliveryFrequencies.id, order.frequencyId)).limit(1);
    const deliveryDays = orderDeliveryDays({ frequencyKey: freq?.key ?? "5_day", includeSaturday: order.includeSaturday, includeSunday: order.includeSunday }) as DayOfWeek[];
    const pauseWindow = order.pausedFrom && order.pausedUntil ? { from: order.pausedFrom, until: order.pausedUntil } : undefined;
    const dates = subscriptionDeliveryDates({ startDate: order.startDate, durationWeeks: order.durationWeeks, deliveryDays, pauseWindow })
      .filter((d) => d.weekStartIso === menuWeek.weekStart);

    let applied = 0;
    const skipped: { dateIso: string; reason: string }[] = [];
    for (const d of dates) {
      try {
        await this.setSelection({ order, menuWeek, dayOfWeek: d.dayOfWeek, slot, personIndex, dishPublicId });
        applied += 1;
      } catch (e) {
        skipped.push({ dateIso: d.dateIso, reason: e instanceof Error ? e.message : "Could not apply" });
      }
    }
    return { applied, skipped };
  },
```

Ensure the imports at the top include what's used (they already do: `deliveryFrequencies`, `orderDeliveryDays`, `subscriptionDeliveryDates`, `DayOfWeek`). `subscriptionDeliveryDates` returns entries with `dayOfWeek`, `dateIso`, `weekStartIso`.

> The loop re-runs `setSelection`'s per-day queries (~5–7 iterations). Acceptable for a week's worth of days. (ponytail: per-day reuse over a hand-rolled batch validator; revisit only if a much larger apply-range is ever added.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm vitest run lib/menu/__tests__/selections-apply-week.test.ts`
Expected: PASS — 1 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/menu/selections.service.ts apps/web/lib/menu/__tests__/selections-apply-week.test.ts
git commit -m "feat(meals): applyToWeek sets one dish across a week's deliveries"
```

---

### Task 3: `applyDishToWeek` server action

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/meals/actions.ts` (add action; reuse the existing auth/ownership block)

**Interfaces:**
- Consumes: `selectionsService.applyToWeek` (Task 2); the same session/order/week lookup pattern already in `pickDish`.
- Produces: `applyDishToWeek(input: { orderId: string; menuWeekId: string; slot: string; personIndex: number; dishId: string }): Promise<{ applied: number; skipped: { dateIso: string; reason: string }[] }>`.

- [ ] **Step 1: Add the action**

In `apps/web/app/(dashboard)/dashboard/meals/actions.ts`, add below `pickDish` (reusing the same imports already at the top of the file):

```typescript
export async function applyDishToWeek(input: {
  orderId: string;
  menuWeekId: string;
  slot: string;
  personIndex: number;
  dishId: string;
}) {
  const session = await getSession();
  if (!session?.user?.id) throw new AuthError();

  const [order] = await db.select().from(orders).where(eq(orders.publicId, input.orderId)).limit(1);
  if (!order) throw new ValidationError("Order not found");

  const isStaff = session.user.role === "admin" || session.user.role === "member";
  if (!isStaff) {
    const [actor] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, session.user.id)).limit(1);
    if (!actor || order.userId !== actor.id) throw new AuthError();
  }

  const [week] = await db.select().from(menuWeeks).where(eq(menuWeeks.publicId, input.menuWeekId)).limit(1);
  if (!week) throw new ValidationError("Menu week not found");

  const result = await selectionsService.applyToWeek({
    order,
    menuWeek: week,
    slot: input.slot,
    personIndex: input.personIndex,
    dishPublicId: input.dishId,
  });
  revalidatePath("/dashboard/meals");
  revalidatePath(`/dashboard/orders/${input.orderId}`);
  return result;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/(dashboard)/dashboard/meals/actions.ts
git commit -m "feat(meals): applyDishToWeek server action"
```

---

### Task 4: Mobile-first selection UI (cards + drawer + default badge + apply-to-week)

**Files:**
- Rewrite: `apps/web/app/(dashboard)/dashboard/meals/meals-grid.tsx`
- Possibly add: shadcn `Drawer` (`pnpm dlx shadcn@latest add drawer`) if `components/ui/drawer.tsx` is absent.

**REQUIRED SUB-SKILLS:** invoke `frontend-design` (layout direction) and `make-interfaces-feel-better` (polish) before writing this task's UI.

**Interfaces:**
- Consumes: `GridCell` with `isDefaulted` (Task 1); `pickDish` (existing) and `applyDishToWeek` (Task 3); props already passed from `page.tsx` (`orderId, menuWeekId, grid, persons, weekDates, enabledSlots, timezone`).

- [ ] **Step 1: Confirm the drawer primitive exists**

Run: `ls apps/web/components/ui/drawer.tsx 2>/dev/null || echo MISSING`
If `MISSING`: `cd apps/web && pnpm dlx shadcn@latest add drawer` (vaul-based; mobile bottom-sheet).

- [ ] **Step 2: Rebuild the component mobile-first**

Replace the `<table>`-based render with a **vertical stack of per-delivery cards** (baseline = phone, single column). Structure:

- Outer: `<div className="space-y-3">` — one `<article>` card per `weekDates` entry.
- Card header: `Mon · 2026-07-06` + a status line (`Locked` or `Edit until {formatDeliveryTime(lockMs, timezone)}`) using `tabular-nums`.
- Card body: for each `enabledSlots` slot × person (`P1…Pn` shown only when `persons > 1`), one **row** with a ≥44px tap target showing the current dish. Find the cell via `grid.find(c => c.dateIso === … && c.slot === … && c.personIndex === …)`.
  - When `cell.isDefaulted`, render the dish name muted plus a `Default` chip (`rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground`), so "you'll get this if you do nothing" is explicit.
  - When locked, the row is read-only text (no tap target).
- Tap on an unlocked row opens a **`Drawer`** listing `cell.dishes` (name + `V/NV`); selecting one calls `pickDish(...)` (same args as today). Full-width, thumb-reachable list items.
- Per slot in the card, an **"Apply to whole week"** action: opens the same dish list; on select, calls `applyDishToWeek({ orderId, menuWeekId, slot, personIndex, dishId })` and shows the returned tally as a toast/inline note: e.g. `Applied to {applied} days` + (if `skipped.length`) `· {skipped.length} skipped`. Never silent.
- Keep all writes on the server actions; use `useTransition` for pending state and optimistic disabled controls (mirror the current `CellSelect` pattern).
- Wider screens (`md:`+): you MAY progressively widen the cards into a multi-column layout; do **not** reintroduce a horizontally-scrolling table as the default.

Concrete pending/error handling: reuse the `useTransition` + local `error` state pattern from the existing `CellSelect` (`meals-grid.tsx:92-111`); surface `applyDishToWeek`'s result in an inline `<p>` under the slot.

- [ ] **Step 3: Verify on a phone viewport**

Run: `cd apps/web && pnpm dev`; open `/dashboard/meals` in DevTools device mode (e.g. iPhone width 390px) for an active order in a released coming week.
Expected: no horizontal scroll; each delivery is a card; tapping a dish opens a bottom drawer; picking updates the row; a defaulted cell shows the `Default` chip; "Apply to whole week" fills the remaining days and reports the count; locked days are read-only.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/(dashboard)/dashboard/meals/meals-grid.tsx apps/web/components/ui/drawer.tsx
git commit -m "feat(meals): mobile-first selection cards with dish drawer, default badges, apply-to-week"
```

---

### Task 5: Fulfillment fallback checkpoint (shared resolver or documented finding)

**Files:**
- Investigate: repo-wide. Possibly modify a fulfillment read to route through a shared resolver, or add a note.

**Interfaces:**
- If a fulfillment read exists: produce `effectiveDishFor(...)` (or route both grid + fulfillment through the existing `isDefault` fallback) so the customer grid and the shipped-dish read cannot diverge.

- [ ] **Step 1: Search for a fulfillment/delivery read**

Run:
```bash
cd apps/web && rg -n "mealSelections|isDefault|effectiveSelections|shipped|fulfil|delivery.*dish|kitchen" lib app --glob '!**/__tests__/**' | rg -iv "meals-grid|selections.service|menu.service|\.test\." | head -40
```
Interpret: is there any code path (ops/kitchen/export) that resolves "what dish ships for delivery X" independently of `buildMealsGrid`?

- [ ] **Step 2a: If NONE exists**

Record the finding at the top of `selections.service.ts` as a comment and in the spec's section 3:
```typescript
// NOTE (2026-07-01): the isDefault fallback for "what a subscriber receives when they
// don't pick" lives only in buildMealsGrid (meals-grid.ts). No separate fulfillment read
// exists yet. Any future kitchen/ops read MUST resolve the same way (explicit pick →
// else the day/slot isDefault item) or subscribers get a different meal than the grid shows.
```
No behavior change; commit the note.

- [ ] **Step 2b: If a fulfillment read EXISTS**

Extract the pick-or-default resolution into one shared helper in `selections.service.ts`:
```typescript
// resolves the effective dish for one order/day/slot/person: explicit pick, else the day/slot default.
export function effectiveDishId(
  picks: { dayOfWeek: string; slot: string; personIndex: number; dishId: bigint }[],
  slotItems: { dishId: bigint; isDefault: boolean }[],
  day: string, slot: string, person: number,
): bigint | null {
  const pick = picks.find((p) => p.dayOfWeek === day && p.slot === slot && p.personIndex === person);
  if (pick) return pick.dishId;
  return slotItems.find((i) => i.isDefault)?.dishId ?? null;
}
```
Refactor `buildMealsGrid`'s inline block (Task 1) **and** the fulfillment read to both call it. Add a live-DB test asserting both paths return the same dish for a defaulted cell.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(meals): ensure fulfillment default fallback matches the customer grid"
```

---

## Self-Review

**Spec coverage:**
- Scope gate (released week only, dynamic) → unchanged, restated in constraints; no code needed. ✅
- Apply-to-whole-week → Task 2 (service+test) + Task 3 (action) + Task 4 (UI). ✅
- Surface default in grid → Task 1 (`isDefaulted`) + Task 4 (badge). ✅
- Fulfillment fallback checkpoint → Task 5. ✅
- Mobile-first UX revamp → Task 4 (cards + drawer, phone baseline). ✅
- Edge cases (partial apply reported, locked read-only, cancelled/paused inherited from `setSelection`) → Task 2 test covers skip-with-reason; locked/paused handled by `setSelection` reuse. ✅

**Placeholder scan:** Task 4 is structural-by-necessity (a UI rebuild driven by the design skills) but every data contract, prop, action signature, and interaction is concrete; Tasks 1–3, 5 carry full code. No "TBD"/"add error handling" placeholders.

**Type consistency:** `applyToWeek`/`applyDishToWeek` signatures match across service, action, and UI; `GridCell.isDefaulted: boolean` added in the type and set in the loop and read in the UI; `setSelection` args reused verbatim.
