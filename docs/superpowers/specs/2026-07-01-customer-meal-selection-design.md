# Customer Meal Selection — Design

**Date:** 2026-07-01
**Status:** Approved (design)
**Scope:** Customer side. Spec 2 of 2 in the customer-meal-journey effort. Depends on Spec 1 (`2026-07-01-menu-builder-defaults-design.md`) — defaults must be settable before the fallback is meaningful.

## Context

After a customer subscribes (a subscription is an `orders` row), they choose dishes for upcoming deliveries at `/dashboard/meals`. Today:

- `buildMealsGrid` (`meals-grid.ts:48`) builds a grid for the **coming released week only**, per delivery date × slot × person, diet-filtered.
- `pickDish` action → `selectionsService.setSelection` (`selections.service.ts`) validates: day in the subscription's delivery set, per-day cutoff not passed, dish on that day's menu, dish diet matches plan. Upserts `mealSelections`.
- No pick → grid falls back to the `isDefault` item (`meals-grid.ts:137`).
- The UI is a plain `<table>` of per-cell `Select` dropdowns (`meals-grid.tsx`).

Missing: a "set the whole week at once" affordance, a visible signal of what the default fallback will deliver, and a polished UI. Also unverified: whether delivery *fulfillment* uses the same default fallback as the customer grid.

## Non-goals

- No multi-week / whole-subscription selection. Coming released week only (decision 2026-07-01).
- No change to the release gate — selection stays enabled dynamically only when that week's `menuWeeks` row is `released`. No hardcoded flag.
- No account-email / payment work.

## Scope gate (unchanged, restated)

Selection is available only when the coming week has a `released` menu. This is already dynamic (`meals-grid.ts:60` requires a `released` row); Spec 2 preserves it. When no released week exists, the page shows the existing empty state.

## 1. Apply to whole week

New server action `applyDishToWeek({ orderId, menuWeekId, slot, personIndex, dishId })`:

- Auth + order-ownership check identical to `pickDish` (`meals/actions.ts`).
- Resolve the subscription's delivery dates for the coming week (same `subscriptionDeliveryDates` + `orderDeliveryDays` the service already uses).
- For each delivery date, call the existing `selectionsService.setSelection`. **Reuse, do not fork the validation.** A per-date call naturally skips days where cutoff passed, the dish isn't on that day's menu, or diet mismatches — by throwing; the action catches per-date and tallies.
- Return `{ applied: number, skipped: Array<{ dateIso, reason }> }`.
- `revalidatePath("/dashboard/meals")` + the order page.

UI: an "Apply to whole week" affordance per (slot, person), surfaced from a chosen dish. After it runs, show a compact result ("Applied to 4 days · 1 locked, 1 not on menu"). Never silent partial success.

## 2. Surface the default in the grid

A cell with no explicit `mealSelection` currently falls back to `isDefault` invisibly. Make it visible:

- `GridCell` exposes both the customer's explicit pick (if any) and the resolved default dish for that day/slot.
- The cell renders: the explicit pick when set; otherwise the default dish shown as a muted/ghost row with a small **"Default"** badge.
- This makes "else the default meal is given" legible instead of silent — the customer sees exactly what ships if they do nothing.

No new query — `meals-grid.ts:137` already resolves the default; this exposes it in the cell shape rather than collapsing it into a single `selectedDishId`.

## 3. Fulfillment fallback (Spec-1 checkpoint)

`createOrder` seeds no `mealSelections`; a delivery's dish is resolved at read time. Verify the **delivery-fulfillment read** (whatever the kitchen/ops path uses to determine the shipped dish) applies the same `isDefault` fallback as the customer grid.

- If a fulfillment read exists, route both it and the grid through one shared resolver (`effectiveDishFor(order, menuWeek, day, slot, person)`) so they cannot diverge.
- If no fulfillment read exists yet, record that the default fallback currently lives only in the customer grid, and that any future fulfillment read must use the shared resolver. Do not build a fulfillment path here.

## 4. UX revamp — `meals-grid.tsx`

Apply `make-interfaces-feel-better` at build time. The current plain table of dropdowns becomes a polished selection surface:

- Cleaner per-day layout (cards or a refined grid), dish name + diet dot (+ thumbnail if available on the dish), clear "Locked" vs "Edit until HH:MM" states (data already present in `WeekDate`).
- The "Apply to whole week" affordance per slot.
- Default badges (section 2), optimistic updates, enter/exit + stagger motion, accessible controls, tabular-nums on times.
- Keep server actions as the write path; no client-side state divergence.

## Edge cases

- Bulk apply respects per-day cutoff, per-day availability, and diet; partial success is reported with per-day reasons.
- Locked days are read-only in the grid (existing `locked` flag).
- Cancelled / paused orders: `setSelection` already guards (cancelled rejected; paused windows excluded from delivery dates) — bulk apply inherits this.
- One default per cell is guaranteed by Spec 1; the grid trusts that invariant.

## Testing

Live-DB harness (see [[live-db-test-harness]]):

- `applyDishToWeek` applies the dish to all eligible delivery days for one (slot, person).
- It skips and reports days that are locked (past cutoff), missing the dish on the menu, or diet-mismatched.
- Grid returns the default dish (with a default marker) for a day/slot the customer has not picked, and the explicit pick when they have.

## Files touched

- `apps/web/app/(dashboard)/dashboard/meals/actions.ts` — add `applyDishToWeek`.
- `apps/web/lib/menu/selections.service.ts` — optional shared `effectiveDishFor` resolver if a fulfillment read exists.
- `apps/web/lib/menu/meals-grid.ts` — expose explicit pick vs default in `GridCell`.
- `apps/web/app/(dashboard)/dashboard/meals/meals-grid.tsx` — revamped UI, apply-to-week, default badges.
- `apps/web/lib/menu/__tests__/selections.*` (or existing harness location) — service test.

## Related

[[weekly-menu-unified-model]], [[staff-ist-customers-canada]] (cutoffs anchored to delivery TZ), [[services-extend-commons-convention]], [[live-db-test-harness]]
