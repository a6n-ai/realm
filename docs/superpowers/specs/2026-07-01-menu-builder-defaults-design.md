# Menu Builder Revamp + Default Meals — Design

**Date:** 2026-07-01
**Status:** Approved (design)
**Scope:** Admin side only. Spec 1 of 2 in the customer-meal-journey effort. Spec 2 = customer meal selection (consumes the defaults set here).

## Context

A "subscription" is an `orders` row (`SUB-` prefix); there is no separate subscription entity. When a customer does not pick a dish for an upcoming delivery, the meals grid is *supposed* to fall back to a per-slot **default** dish. The read side already exists:

- `menuItems.isDefault` (bool) column — per day × slot × week (`db/schema/menu.ts:55`).
- Customer grid falls back to the `isDefault` item when no selection exists (`meals-grid.ts:137`).

But the **write side was never built**: `menu.service.ts:43` hardcodes `isDefault: false` on every add, and the menu builder has no control to mark a default. So the fallback never fires in production — a customer who skips gets no meal.

This spec completes the write path and revamps the builder UI.

## Non-goals

- No new default concept beyond the existing per-cell `isDefault` (no standing package-level default table).
- No customer-facing changes (Spec 2).
- No payment / account-email work (out of scope by decision 2026-07-01).

## Data model

No schema change. Reuse `menuItems.isDefault`.

**Invariant:** at most one `isDefault = true` item per `(menuWeekId, dayOfWeek, slot)` cell.

## Service — `menu.service.ts`

New method `setDefault({ itemId })`:

- Resolve the item → its `(menuWeekId, dayOfWeek, slot)`.
- In one transaction: set `isDefault = true` on the target and `isDefault = false` on all siblings in the same cell.
- If the target is **already** the default → toggle off (set `false`); the cell ends with no default.
- Guard: draft weeks only (mirrors add/remove). Reject on a released week.
- Follows the commons subclass-override convention (audited write) — see [[services-extend-commons-convention]].

`removeItem` behavior: if the removed item was the default, the cell simply has no default afterward. No auto-reassignment; the admin re-picks.

## Server action — `menus/actions.ts`

```
setDefault(itemId: string): requireAdmin → menuService.setDefault({ itemId }) → revalidate()
```

Same shape/guards as the existing `removeItem` action. `revalidate()` already covers `/dashboard/menus`, `/menu/weekly`, `/`.

## Consumption (already wired + one downstream checkpoint)

- Customer grid fallback (`meals-grid.ts:137`) begins working as soon as defaults are set. No change here.
- **Checkpoint for Spec 2 / fulfillment (not built here):** `createOrder` seeds no `mealSelections`, so a subscriber's delivered meal is resolved at read time. Confirm the *delivery fulfillment* read path also falls back to `isDefault` (not only the customer-facing grid). Recorded as a Spec-2 verification item.

## UX revamp — `menu-builder.tsx`

Apply `make-interfaces-feel-better` principles at build time. The builder works today but is visually plain. Changes:

1. **Default control.** A star/pin toggle on each dish row. The default row shows a filled star + a small "Default" chip; non-default rows show an outline star on hover. One default per cell, enforced by the service. Optimistic update, keyboard-accessible (`aria-pressed`), draft-only (hidden/disabled on released weeks).
2. **Reorder (optional, easy to cut).** `menuService.reorderItems` already exists but no UI calls it. Wire drag-to-reorder of dish rows within a cell, persisting `position`. Pure UI wiring — no backend cost.
3. **Polish.** Optical alignment of rows, tabular-nums on the per-day dish count (already partial), consistent slot subheaders, an explicit empty-slot state, staggered list render, enter/exit transition on add/remove, refined draft/released status bar. Keep the sticky live poster preview (`WeeklyMenuPoster`).

## Edge cases

- Setting a new default unsets the prior atomically (same txn) — never two defaults in a cell.
- Weekend dishes are stored under `sat` (Sat+Sun merged column); the default applies to that merged weekend cell.
- Default-setting is **draft-only**. A released week is customer-facing; changing its fallbacks under live selection is disallowed.
- Removing the default dish clears the cell's default (no error, no reassign).

## Testing

One service test in the live-DB harness (see [[live-db-test-harness]]):

- `setDefault` marks one item and unsets siblings in the same cell.
- Calling `setDefault` on the current default toggles it off.
- `removeItem` on a default leaves the cell with no default.
- Setting default on a released week is rejected.

## Files touched

- `apps/web/lib/services/menu.service.ts` — add `setDefault`.
- `apps/web/app/(dashboard)/dashboard/menus/actions.ts` — add `setDefault` action.
- `apps/web/app/(dashboard)/dashboard/menus/menu-builder.tsx` — default toggle UI, reorder wiring, polish.
- `apps/web/lib/services/__tests__/menu.service.*` — service test.

## Related

[[weekly-menu-unified-model]], [[services-extend-commons-convention]], [[admin-typed-controls]], [[live-db-test-harness]]
