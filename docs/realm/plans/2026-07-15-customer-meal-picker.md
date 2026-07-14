# Customer Meal Picker + Cutoff Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the existing meal-selection engine under `/me/meals` as a photo-driven customer picker, with a live cutoff countdown banner.

**Architecture:** Reuse `buildMealsGrid` (grid model), `selectionsService` (persist), `resolveDeliveryMeal` (defaults). Extend grid options to carry the dish image. New customer server actions gate via `assertOwnsOrder`. A new `/me/meals` route (role-gated by the `(customer)` layout) renders a new `<MealPicker>` + `<CutoffBanner>`. No DB schema change.

**Tech Stack:** Next.js 16, React 19, Drizzle, Vitest (live-DB + jsdom), Slice-0 `@/components/motion`, Slice-1 `<DishImage>`, `@realm/storage` `FileDetail`.

## Global Constraints

- All in `apps/tiffin-grab`. **No DB schema change.** No `proxy.ts` change (the `(customer)` layout already gates `role === "user"`).
- Selection granularity is per **(order, menuWeek, dayOfWeek, slot, personIndex, pickIndex)** — a weekday within the released week; `applyToWeek` propagates. No per-delivery override.
- **Primary active order only** (first active order for the user, by `orders.createdAt desc`); multi-order switcher deferred — surface a "Showing <plan>" note.
- Ownership: customer actions resolve `currentUserId()` and call `assertOwnsOrder(userId, orderPublicId)` (from `@/lib/services/customer-deliveries.service`) before delegating; not-owned throws `NotFoundError`.
- Cutoff is READ-ONLY from the snapshot: `WeekDateView.lockMs` (= the delivery row's `cutoffAt` epoch ms); `locked = Date.now() > lockMs`. Never recompute from `cutoffHour`.
- Optimistic picks must revert + toast on server rejection (locked/validation) — the server is the source of truth (`selectionsService` throws "Selections are locked…" when past cutoff).
- `"use client"` on picker/banner; `cn` from `@realm/ui/cn`; reduced-motion honored (banner pulse off, still ticks). `*Skeleton` twins are top-level named exports.
- Verify gate after each task: `pnpm --filter tiffin-grab exec tsc --noEmit` + the task test. Final task: `pnpm turbo typecheck && pnpm turbo test`.
- Worktree `/Users/lawbringr/IdeaProjects/realm-wt-2f09d8c4`, branch `wt/slice2-meals`. node_modules installed. Local Postgres reachable (prior slices).

## Reuse reference (exact — from the understand pass)

- `buildMealsGrid(order: MealOrder, settings: { timezone: string; cutoffHour: number }): Promise<MealsGridResult>` (`lib/menu/meals-grid.ts:60`).
- `MealsGridResult` = `{ empty: "no-week" | "no-dates" }` OR `{ empty: null; releasedWeek; weekDatesView: WeekDateView[]; grid: GridCell[]; categories: {key,label,selectable,sortOrder}[]; persons }`.
- `GridCell` (`meals-grid.ts:12`) = `{ day; dateIso; slot; personIndex; pickIndex; selectable; quantity; selectedDishId: string|null; isDefaulted; dishes: {id;name;diet}[]; locked }`. `selectedDishId` = the chosen option's dish publicId; `dishes` = the options.
- `WeekDateView` (`:26`) = `DeliveryDate & { lockMs: number; locked: boolean }`.
- Dish options originate at `meals-grid.ts:99-104` (`db.select({ id: dishes.publicId, bigintId: dishes.id, name: dishes.name, diet: dishes.diet })`) → `dishMap` (`:107`, drops bigintId) → `GridCell.dishes`.
- Existing action pattern (`app/(dashboard)/dashboard/meals/actions.ts`): `pickDish({orderId, menuWeekId, dayOfWeek, slot, personIndex, pickIndex?, dishId})` → load order + week → gate → `selectionsService.setSelection({ order, menuWeek: week, dayOfWeek, slot, personIndex, pickIndex: pickIndex ?? 1, dishPublicId: input.dishId })` → revalidate. `applyDishToWeek({orderId, menuWeekId, slot, personIndex, pickIndex?, dishId})` → `selectionsService.applyToWeek({ order, menuWeek, slot, personIndex, pickIndex, dishPublicId })` → returns `{applied, skipped}`.
- Loader pattern (`dashboard/meals/page.tsx` `MealsData`): one join `orders ⋈ deliveryFrequencies ⋈ users` on `users.publicId === session.user.id`, `orderBy(desc(orders.createdAt)).limit(1)`, `activeOrder = row?.status === "active" ? row : null`, then `buildMealsGrid(activeOrder, { timezone, cutoffHour })` from `getAppSettings()`.

## File Structure

- `lib/menu/meals-grid.ts` — add `image` to the dish select, `dishMap` value, and `GridCell.dishes` element type.
- `app/(customer)/me/meals/page.tsx` — loader + islands (NEW).
- `app/(customer)/me/meals/actions.ts` — `pickMyDish` + `applyMyDishToWeek` (NEW).
- `components/customer/meals/cutoff-banner.tsx` — `<CutoffBanner>` (NEW).
- `components/customer/meals/meal-picker.tsx` — `<MealPicker>` (+ Skeleton) (NEW).
- `components/customer/customer-bottom-nav.tsx` + `customer-sidebar.tsx` — add "Meals" nav item.
- Tests colocated in each area's `__tests__/`.

---

### Task 1: Carry dish image on grid options

**Files:**
- Modify: `apps/tiffin-grab/lib/menu/meals-grid.ts`
- Test: `apps/tiffin-grab/lib/menu/__tests__/meals-grid-image.test.ts`

**Interfaces:**
- Produces: `GridCell.dishes` element becomes `{ id: string; name: string; diet: "veg" | "nonveg"; image: FileDetail | null }`. `buildMealsGrid` populates `image` from `dishes.image`.

- [ ] **Step 1: Read** `lib/menu/meals-grid.ts` — the `GridCell` type (`:12-24`), the dish `db.select` (`:99-104`), and the `dishMap` construction (`:107`). Confirm `dishes.image` is `jsonb $type<FileDetail>` (nullable).

- [ ] **Step 2: Write the failing test**

Create `apps/tiffin-grab/lib/menu/__tests__/meals-grid-image.test.ts`. This needs a full seed (order + active + materialized deliveries + released menu_week + menu_items + a dish WITH an image). Compose from two existing patterns — READ both first:
- `app/(customer)/me/deliveries/__tests__/actions.test.ts` — `reset()` + `makeOrder(phone, name)` (creates an active order with materialized deliveries; postal M5V 2T6 → in-zone).
- `lib/services/__tests__/published-week-image.test.ts` (Slice 1) — how to seed a released `menu_weeks` + `menu_items` + a dish with `image: IMG` for the order's plan type + a selectable `dish_categories` row/slot.

Then:
```ts
const { buildMealsGrid } = await import("@/lib/menu/meals-grid");
const result = await buildMealsGrid(orderRow, { timezone: "America/Toronto", cutoffHour: 18 });
expect(result.empty).toBeNull();
const cellWithOptions = result.grid.find((c) => c.selectable && c.dishes.length > 0);
expect(cellWithOptions).toBeDefined();
// every option now carries an image field (null or FileDetail); the seeded dish has a real one
expect(cellWithOptions!.dishes.every((d) => "image" in d)).toBe(true);
expect(cellWithOptions!.dishes.some((d) => d.image?.url)).toBe(true);
```
If seeding a fully in-zone, released-week, selectable-category order proves too intricate to get green, report DONE_WITH_CONCERNS with the exact blocker rather than weakening the assertion — the type change + a lighter assertion (see Step 3 note) may be the pragmatic floor.

- [ ] **Step 3: Run it, verify it fails**

Run: `cd apps/tiffin-grab && pnpm exec vitest run lib/menu/__tests__/meals-grid-image.test.ts`
Expected: FAIL — options lack `image` (`"image" in d` false / no `.url`).

- [ ] **Step 4: Implement (3 spots)**

In `lib/menu/meals-grid.ts`:
1. `GridCell.dishes` element type (`:22`): add `image: FileDetail | null`. Import `FileDetail` from `@realm/storage/model` if not present.
2. The dish `db.select` (`:99-104`): add `image: dishes.image`.
3. `dishMap` value (`:107`): include `image: d.image ?? null` so `slotDishes` options carry it.

The staff `meals-grid.tsx` ignores the new field — additive, no staff-side change.

- [ ] **Step 5: Run it, verify it passes**

Run: `cd apps/tiffin-grab && pnpm exec vitest run lib/menu/__tests__/meals-grid-image.test.ts`
Expected: PASS. Also run existing meals tests: `pnpm exec vitest run lib/menu/__tests__` (no regression).

- [ ] **Step 6: Typecheck + commit**

```bash
cd apps/tiffin-grab && pnpm exec tsc --noEmit
git add lib/menu/meals-grid.ts lib/menu/__tests__/meals-grid-image.test.ts
git commit -m "feat(menu): carry dish image on meal-picker grid options"
```

---

### Task 2: Customer meal-selection actions

**Files:**
- Create: `apps/tiffin-grab/app/(customer)/me/meals/actions.ts`
- Test: `apps/tiffin-grab/lib/menu/__tests__/pick-my-dish.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export async function pickMyDish(input: { orderId: string; menuWeekId: string; dayOfWeek: "mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun"; slot: string; personIndex: number; pickIndex?: number; dishId: string }): Promise<void>;
  export async function applyMyDishToWeek(input: { orderId: string; menuWeekId: string; slot: string; personIndex: number; pickIndex?: number; dishId: string }): Promise<{ applied: number; skipped: string[] }>;
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/tiffin-grab/lib/menu/__tests__/pick-my-dish.test.ts` using the Slice-4 shared harness (`reset`/`makeOrder`/`userIdOf`/`actAs` — mirror `app/(customer)/me/deliveries/__tests__/actions.test.ts`) plus a released-week + menu_item + selectable-category seed (from `published-week-image.test.ts`). Cases:
- owner picks a valid dish → `pickMyDish(...)` resolves; a `meal_selections` row exists for `(orderId, menuWeekId, day, slot, person, pickIndex)` with the chosen `dishId`.
- a non-owner (user B, acting) calling `pickMyDish` on user A's order → rejects with `NotFoundError` (IDOR via `assertOwnsOrder`).
Query `meal_selections` via `db.select().from(mealSelections).where(...)` to assert the write.

- [ ] **Step 2: Run it, verify it fails**

Run: `cd apps/tiffin-grab && pnpm exec vitest run lib/menu/__tests__/pick-my-dish.test.ts`
Expected: FAIL — `pickMyDish` not found.

- [ ] **Step 3: Implement**

Create `apps/tiffin-grab/app/(customer)/me/meals/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { NotFoundError } from "@realm/commons";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { menuWeeks, orders } from "@/db/schema";
import { currentUserId } from "@/lib/services/session-service";
import { assertOwnsOrder } from "@/lib/services/customer-deliveries.service";
import { selectionsService } from "@/lib/menu/selections.service";

async function me(): Promise<bigint> {
  const id = await currentUserId();
  if (id == null) throw new NotFoundError("Not signed in");
  return id;
}

export async function pickMyDish(input: {
  orderId: string; menuWeekId: string;
  dayOfWeek: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  slot: string; personIndex: number; pickIndex?: number; dishId: string;
}): Promise<void> {
  const userId = await me();
  await assertOwnsOrder(userId, input.orderId); // IDOR gate before the mutation
  const [order] = await db.select().from(orders).where(eq(orders.publicId, input.orderId)).limit(1);
  if (!order) throw new NotFoundError("Subscription not found");
  const [week] = await db.select().from(menuWeeks).where(eq(menuWeeks.publicId, input.menuWeekId)).limit(1);
  if (!week) throw new NotFoundError("Menu week not found");
  await selectionsService.setSelection({
    order, menuWeek: week, dayOfWeek: input.dayOfWeek, slot: input.slot,
    personIndex: input.personIndex, pickIndex: input.pickIndex ?? 1, dishPublicId: input.dishId,
  });
  revalidatePath("/me/meals");
}

export async function applyMyDishToWeek(input: {
  orderId: string; menuWeekId: string; slot: string; personIndex: number; pickIndex?: number; dishId: string;
}): Promise<{ applied: number; skipped: string[] }> {
  const userId = await me();
  await assertOwnsOrder(userId, input.orderId);
  const [order] = await db.select().from(orders).where(eq(orders.publicId, input.orderId)).limit(1);
  if (!order) throw new NotFoundError("Subscription not found");
  const [week] = await db.select().from(menuWeeks).where(eq(menuWeeks.publicId, input.menuWeekId)).limit(1);
  if (!week) throw new NotFoundError("Menu week not found");
  const result = await selectionsService.applyToWeek({
    order, menuWeek: week, slot: input.slot, personIndex: input.personIndex,
    pickIndex: input.pickIndex ?? 1, dishPublicId: input.dishId,
  });
  revalidatePath("/me/meals");
  return result;
}
```
(Confirm `assertOwnsOrder` throws `NotFoundError` for not-owned — it does, per Slice 4. `selectionsService.setSelection`/`applyToWeek` arg shapes match the staff action verbatim.)

- [ ] **Step 4: Run it, verify it passes**

Run: `cd apps/tiffin-grab && pnpm exec vitest run lib/menu/__tests__/pick-my-dish.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
cd apps/tiffin-grab && pnpm exec tsc --noEmit
git add "app/(customer)/me/meals/actions.ts" lib/menu/__tests__/pick-my-dish.test.ts
git commit -m "feat(customer): pickMyDish + applyMyDishToWeek actions (owner-gated)"
```

---

### Task 3: `<CutoffBanner>`

**Files:**
- Create: `apps/tiffin-grab/components/customer/meals/cutoff-banner.tsx`
- Test: `apps/tiffin-grab/components/customer/meals/__tests__/cutoff-banner.test.tsx`

**Interfaces:**
- Produces: `export function CutoffBanner({ days, now }: { days: { dateIso: string; dayOfWeek: string; lockMs: number }[]; now?: number })` — `now` injectable for tests. Renders a countdown to the soonest `lockMs` where `now < lockMs`; all locked → the locked message.

- [ ] **Step 1: Write the failing test**

Create `apps/tiffin-grab/components/customer/meals/__tests__/cutoff-banner.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("motion/react", () => ({ useReducedMotion: () => true }));

import { CutoffBanner } from "../cutoff-banner";

const NOW = 1_000_000_000_000;
afterEach(cleanup);

describe("CutoffBanner", () => {
  it("counts down to the soonest still-editable cutoff", () => {
    const days = [
      { dateIso: "2026-07-14", dayOfWeek: "mon", lockMs: NOW - 1000 },       // passed
      { dateIso: "2026-07-15", dayOfWeek: "tue", lockMs: NOW + 4 * 3600_000 + 12 * 60_000 }, // 4h12m
    ];
    render(<CutoffBanner days={days} now={NOW} />);
    expect(screen.getByText(/4h 12m/)).toBeInTheDocument();
    expect(screen.getByText(/Tue/i)).toBeInTheDocument();
  });

  it("shows the locked message when every day is past cutoff", () => {
    const days = [{ dateIso: "2026-07-14", dayOfWeek: "mon", lockMs: NOW - 1000 }];
    render(<CutoffBanner days={days} now={NOW} />);
    expect(screen.getByText(/locked/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd apps/tiffin-grab && pnpm exec vitest run components/customer/meals/__tests__/cutoff-banner.test.tsx`
Expected: FAIL — cannot resolve `../cutoff-banner`.

- [ ] **Step 3: Implement**

Create `apps/tiffin-grab/components/customer/meals/cutoff-banner.tsx` (`"use client"`):

```tsx
"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { ClockIcon } from "lucide-react";
import { cn } from "@realm/ui/cn";

const DAY_LABEL: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

function fmt(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function CutoffBanner({ days, now: injectedNow }: { days: { dateIso: string; dayOfWeek: string; lockMs: number }[]; now?: number }) {
  const reduce = useReducedMotion();
  const [now, setNow] = useState(injectedNow ?? Date.now());

  useEffect(() => {
    if (injectedNow != null) return; // test-injected clock is fixed
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [injectedNow]);

  const next = days.filter((d) => now < d.lockMs).sort((a, b) => a.lockMs - b.lockMs)[0];

  if (!next) {
    return (
      <div className="bg-muted text-muted-foreground flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm">
        <ClockIcon className="size-4 shrink-0" aria-hidden />
        This week's meals are locked.
      </div>
    );
  }

  const remaining = next.lockMs - now;
  const soon = remaining < 3600_000; // < 1h → emphasize
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium",
        soon ? "bg-warn/15 text-warn" : "bg-primary/10 text-primary",
        soon && !reduce && "animate-pulse",
      )}
      role="status"
    >
      <ClockIcon className="size-4 shrink-0" aria-hidden />
      <span className="tabular-nums">{fmt(remaining)}</span> to change {DAY_LABEL[next.dayOfWeek] ?? next.dayOfWeek}&rsquo;s meals
    </div>
  );
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `cd apps/tiffin-grab && pnpm exec vitest run components/customer/meals/__tests__/cutoff-banner.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
cd apps/tiffin-grab && pnpm exec tsc --noEmit
git add components/customer/meals/cutoff-banner.tsx components/customer/meals/__tests__/cutoff-banner.test.tsx
git commit -m "feat(customer): <CutoffBanner> live countdown"
```

---

### Task 4: `<MealPicker>`

**Files:**
- Create: `apps/tiffin-grab/components/customer/meals/meal-picker.tsx`
- Test: `apps/tiffin-grab/components/customer/meals/__tests__/meal-picker.test.tsx`

**Interfaces:**
- Consumes: `GridCell` (Task 1, options now carry `image`), `pickMyDish`/`applyMyDishToWeek` (Task 2), `DishImage` from `@/components/customer/home/dish-image` (Slice 1), `Reveal`/`Pressable` from `@/components/motion`, sonner `toast`.
- Produces: `MealPicker({ grid, categories, orderPublicId, menuWeekId }: { grid: GridCell[]; categories: {key;label;selectable;sortOrder}[]; orderPublicId: string; menuWeekId: string })` + `MealPickerSkeleton`.

- [ ] **Step 1: Write the failing test**

Create `apps/tiffin-grab/components/customer/meals/__tests__/meal-picker.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const pickMyDish = vi.fn().mockResolvedValue(undefined);
vi.mock("@/app/(customer)/me/meals/actions", () => ({ pickMyDish: (...a: unknown[]) => pickMyDish(...a), applyMyDishToWeek: vi.fn() }));
vi.mock("@/components/motion", () => ({
  Reveal: Object.assign(({ children }: { children: React.ReactNode }) => <div>{children}</div>, { Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }),
  Pressable: ({ children, ...p }: never) => <button {...(p as object)}>{children}</button>,
}));
vi.mock("@realm/ui/sonner", () => ({ toast: { error: vi.fn() } }));

import { MealPicker } from "../meal-picker";

const grid = [
  { day: "tue", dateIso: "2026-07-15", slot: "sabzi", personIndex: 1, pickIndex: 1, selectable: true, quantity: 1, selectedDishId: "dsh_1", isDefaulted: false, locked: false,
    dishes: [ { id: "dsh_1", name: "Paneer", diet: "veg", image: null }, { id: "dsh_2", name: "Aloo Gobi", diet: "veg", image: null } ] },
  { day: "wed", dateIso: "2026-07-16", slot: "sabzi", personIndex: 1, pickIndex: 1, selectable: true, quantity: 1, selectedDishId: "dsh_1", isDefaulted: false, locked: true,
    dishes: [ { id: "dsh_1", name: "Paneer", diet: "veg", image: null } ] },
] as never;
const categories = [{ key: "sabzi", label: "Sabzi", selectable: true, sortOrder: 0 }] as never;

afterEach(() => { pickMyDish.mockClear(); cleanup(); });

describe("MealPicker", () => {
  it("marks the selected option and fires pickMyDish on tapping another", () => {
    render(<MealPicker grid={grid} categories={categories} orderPublicId="ord_1" menuWeekId="mnw_1" />);
    fireEvent.click(screen.getByText("Aloo Gobi"));
    expect(pickMyDish).toHaveBeenCalledWith(expect.objectContaining({ orderId: "ord_1", menuWeekId: "mnw_1", dayOfWeek: "tue", slot: "sabzi", personIndex: 1, dishId: "dsh_2" }));
  });

  it("does not fire on a locked day's options", () => {
    render(<MealPicker grid={grid} categories={categories} orderPublicId="ord_1" menuWeekId="mnw_1" />);
    // "Paneer" appears on both days; the locked (wed) card's option must not be tappable.
    // Assert the locked day shows a read-only indicator.
    expect(screen.getByText(/locked/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd apps/tiffin-grab && pnpm exec vitest run components/customer/meals/__tests__/meal-picker.test.tsx`
Expected: FAIL — cannot resolve `../meal-picker`.

- [ ] **Step 3: Implement**

Create `apps/tiffin-grab/components/customer/meals/meal-picker.tsx` (`"use client"`). Group `grid` cells by `dateIso`/`day` (chronological). Per day render a labelled section; per selectable cell render its `dishes` options as `<Pressable>` cards (`<DishImage image={o.image} name={o.name} />` + name + a check when `o.id === cell.selectedDishId`). Tapping an option (only when `!cell.locked` and `o.id !== cell.selectedDishId`) optimistically marks it, calls `pickMyDish({ orderId: orderPublicId, menuWeekId, dayOfWeek: cell.day, slot: cell.slot, personIndex: cell.personIndex, pickIndex: cell.pickIndex, dishId: o.id })`, and on rejection reverts + `toast.error(err.message)`. Locked days render options read-only with a "Locked" badge (no tap). Fixed (`selectable === false`) cells render the single `dishes[0]` read-only. An "Apply to the whole week" control per selected cell calls `applyMyDishToWeek({...})`. `Reveal.Group` staggers day sections. Provide `MealPickerSkeleton` (top-level named export). Import `toast` from `@realm/ui/sonner` (confirm the export path — the app uses sonner; mirror an existing customer toast usage).

Note: keep the optimistic state minimal (a `Map<cellKey, dishId>` overriding `selectedDishId`); on action rejection, delete the override (revert) and toast.

- [ ] **Step 4: Run it, verify it passes**

Run: `cd apps/tiffin-grab && pnpm exec vitest run components/customer/meals/__tests__/meal-picker.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
cd apps/tiffin-grab && pnpm exec tsc --noEmit
git add components/customer/meals/meal-picker.tsx components/customer/meals/__tests__/meal-picker.test.tsx
git commit -m "feat(customer): <MealPicker> photo-driven meal selection"
```

---

### Task 5: `/me/meals` route + loader

**Files:**
- Create: `apps/tiffin-grab/app/(customer)/me/meals/page.tsx`
- Test: `apps/tiffin-grab/app/(customer)/me/meals/__tests__/page-load.test.ts` (loader-shape unit, see note)

**Interfaces:**
- Consumes: `buildMealsGrid`, `getAppSettings`, `currentUserId`, `myActiveSubscriptions`, `CutoffBanner` (Task 3), `MealPicker` (Task 4), `LottieEmptyState`.

- [ ] **Step 1: Read** `dashboard/meals/page.tsx` `MealsData` for the loader shape (the `orders ⋈ deliveryFrequencies ⋈ users` join, `activeOrder` gating, `buildMealsGrid` call). The customer version resolves the user via `currentUserId()` (a bigint) instead of the `users.publicId` join.

- [ ] **Step 2: Implement the page**

Create `apps/tiffin-grab/app/(customer)/me/meals/page.tsx`:
- `currentUserId()`; if null → `redirect("/login")`.
- Load the primary active order: query `orders ⋈ deliveryFrequencies` where `orders.userId = userId`, `orderBy(desc(orders.createdAt))`, filter to the first `status === "active"` row (select the same columns `MealOrder` needs: `id, publicId, planId, persons, categoryCounts, mealSlots, includeSaturday, includeSunday, startDate, durationWeeks, frequencyKey, status`). If no active order → `<LottieEmptyState animation="empty-box" title="Subscribe to plan your meals" body="..." action={<Link href="/subscribe">Browse plans</Link>} />`.
- `getAppSettings()` → `{ timezone, cutoffHour }`; `buildMealsGrid(activeOrder, { timezone, cutoffHour })`.
- If `result.empty` (`"no-week"`/`"no-dates"`) → `<LottieEmptyState animation="empty-box" title="This week's menu isn't out yet" body="..." />`.
- Else render: `<CutoffBanner days={result.weekDatesView.map((d) => ({ dateIso: d.dateIso, dayOfWeek: d.dayOfWeek, lockMs: d.lockMs }))} />` + `<MealPicker grid={result.grid} categories={result.categories} orderPublicId={activeOrder.publicId} menuWeekId={result.releasedWeek.publicId} />`. Wrap in a `PageShell`/header consistent with other `/me` pages. Use a `<Suspense>` island with `<MealPickerSkeleton>` fallback around the async data component (mirror `me/page.tsx`).
- If the user has an active order but ALSO other active subs, render a small "Showing <planName> — more coming soon" note (multi-order deferral).

- [ ] **Step 3: Test (loader-shape unit)**

A full RSC render is heavy; instead unit-test the primary-order selection helper. Extract the "pick the first active order" logic into a small pure exported function `pickPrimaryActive(rows)` in the page module (or a sibling `lib`), and test it:
```ts
import { pickPrimaryActive } from "../pick-primary-active"; // or wherever extracted
it("returns the first active order, ignoring non-active", () => {
  expect(pickPrimaryActive([{ status: "waitlisted" }, { status: "active", publicId: "ord_2" }] as never)?.publicId).toBe("ord_2");
  expect(pickPrimaryActive([{ status: "cancelled" } as never])).toBeNull();
});
```
Run: `cd apps/tiffin-grab && pnpm exec vitest run "app/(customer)/me/meals/__tests__/page-load.test.ts"`
RED → implement `pickPrimaryActive` → GREEN.

- [ ] **Step 4: Typecheck + commit**

```bash
cd apps/tiffin-grab && pnpm exec tsc --noEmit
git add "app/(customer)/me/meals" && git commit -m "feat(customer): /me/meals route (picker + cutoff banner)"
```

---

### Task 6: Nav entry + full verify

**Files:**
- Modify: `apps/tiffin-grab/components/customer/customer-bottom-nav.tsx`
- Modify: `apps/tiffin-grab/components/customer/customer-sidebar.tsx`
- Test: extend `apps/tiffin-grab/components/customer/__tests__/customer-bottom-nav.test.tsx`

**Interfaces:**
- Consumes: the `/me/meals` route (Task 5).

- [ ] **Step 1: Read** `customer-bottom-nav.tsx` (the `TABS` array + `BottomNav` usage) and `customer-sidebar.tsx`. Note that `BottomNav` is from `@realm/design-system` and renders links from the `TABS` `href`.

- [ ] **Step 2: Write the failing test**

Extend `components/customer/__tests__/customer-bottom-nav.test.tsx` with a case: a "Meals" tab linking to `/me/meals` is rendered.
```ts
it("renders a Meals tab to /me/meals", () => {
  mockPathname = "/me";
  render(<CustomerBottomNav />);
  expect(screen.getByRole("link", { name: /Meals/i })).toHaveAttribute("href", "/me/meals");
});
```

- [ ] **Step 3: Run it, verify it fails**

Run: `cd apps/tiffin-grab && pnpm exec vitest run components/customer/__tests__/customer-bottom-nav.test.tsx`
Expected: FAIL — no Meals tab.

- [ ] **Step 4: Implement**

Add a `{ href: "/me/meals", title: "Meals", icon: UtensilsCrossedIcon }` entry to `customer-bottom-nav.tsx`'s `TABS` (import `UtensilsCrossedIcon` from lucide-react), positioned sensibly (e.g. after Deliveries). Add the same item to `customer-sidebar.tsx`'s nav list. If these components render plain `next/link`, use the Slice-0 `<TransitionLink>` where the app controls the link directly; if they route through the packaged `BottomNav` (which renders its own links), just add the `TABS` entry.

- [ ] **Step 5: Run it, verify it passes**

Run: `cd apps/tiffin-grab && pnpm exec vitest run components/customer/__tests__/customer-bottom-nav.test.tsx`
Expected: PASS.

- [ ] **Step 6: Full verify gate**

Run: `cd /Users/lawbringr/IdeaProjects/realm-wt-2f09d8c4 && pnpm turbo typecheck && pnpm turbo test`
Expected: typecheck clean; new + motion suites pass; note any PRE-EXISTING unrelated failures (same set: login-form/phone/app-settings/RabbitMQ/flaky live-DB), your touched files pass.

- [ ] **Step 7: Manual browser check**

Start the app, log in as a `user` with an active subscription. Confirm: the Meals nav item opens `/me/meals`; the cutoff banner counts down; tapping a dish photo on an unlocked day changes the selection (persists, visible on `/me/deliveries`); a locked day is read-only; picking past cutoff is rejected + toasts. Note if the seed order has no released week (empty state shows) — data, not a bug.

- [ ] **Step 8: Commit**

```bash
git add apps/tiffin-grab/components/customer/customer-bottom-nav.tsx apps/tiffin-grab/components/customer/customer-sidebar.tsx apps/tiffin-grab/components/customer/__tests__/customer-bottom-nav.test.tsx
git commit -m "feat(customer): Meals nav entry"
```

---

## Self-Review

**Spec coverage:**
- Photo picker (grid options carry image) → Task 1. ✓
- Owner-gated customer actions → Task 2. ✓
- Cutoff countdown banner (soonest editable, all-locked, reduced-motion) → Task 3. ✓
- Photo-driven picker (tap-to-pick, optimistic+revert, locked/fixed read-only, apply-to-week) → Task 4. ✓
- `/me/meals` route + primary-active-order loader + empty states → Task 5. ✓
- Nav entry → Task 6. ✓
- Motion reuse (Reveal/Pressable/DishImage/banner tick) → Tasks 3/4. ✓
- No schema change; primary-order-only with deferral note → held. ✓

**Placeholder scan:** Two intentional read-then-match spots — the sonner `toast` import path (Task 4, "confirm the export path / mirror an existing customer toast") and the nav link mechanism (Task 6, `TransitionLink` vs packaged `BottomNav` — the same ambiguity resolved in Slice 0). Both name what to read and give the full surrounding code. The live-DB tests (Tasks 1, 2) compose two existing, concrete seed patterns (`actions.test.ts` `makeOrder` + `published-week-image.test.ts` menu seed) rather than inventing helpers — Task 1 additionally flags a DONE_WITH_CONCERNS floor if the full in-zone/released/selectable seed proves intractable. All component tests + implementation code are complete.

**Type consistency:** `GridCell.dishes` element gains `image: FileDetail | null` (Task 1), consumed in Task 4's `<DishImage image={o.image}>`. `pickMyDish`/`applyMyDishToWeek` arg shapes (Task 2) match the `MealPicker` call sites (Task 4) and the staff action verbatim. `CutoffBanner` `days` prop (Task 3) is fed from `weekDatesView.map(...)` (Task 5). `MealPicker` props (Task 4) are fed from `result.grid`/`result.categories`/`result.releasedWeek.publicId` (Task 5).

**Live-DB note:** Tasks 1, 2 need local Postgres (reachable in prior slices) + intricate menu/order seeding. If down or the seed is intractable, the implementer flags it rather than weakening assertions.
