# Customer Meal Picker + Cutoff Banner — Design (Slice 2)

**Date:** 2026-07-15
**App:** `apps/tiffin-grab`
**Status:** Approved, ready for implementation plan
**Program:** Customer-experience revamp, Slice 2 of 6. Consumes Slice-0 motion (`@/components/motion`) + Slice-1 `<DishImage>`.

## Goal

Let a logged-in customer pick their own meals for the released week — photo-driven — at a dedicated `/me/meals` route, with a live **cutoff countdown banner**. The selection engine already exists and is customer-aware in code; this slice **surfaces it under `/me`** and builds the net-new banner.

## Ground truth (codebase map, 2026-07-15)

- **The selection engine exists and already permits the owning customer.** `selectionsService.setSelection` / `applyToWeek` (`lib/menu/selections.service.ts`), `buildMealsGrid` (`lib/menu/meals-grid.ts`), `resolveDeliveryMeal` (`lib/menu/resolve-delivery-meal.ts`), and the `pickDish` / `applyDishToWeek` actions (`app/(dashboard)/dashboard/meals/actions.ts`) all work. The action gate is `isStaff || order.userId === actor.id` — **the owning customer is already authorized**.
- **The only blocker:** the picker lives under `(dashboard)`, whose layout redirects `role === "user"` → `/me`. `dashboard/meals/page.tsx` already loads the *session user's own* active order ("My Meals").
- **Selection granularity:** `meal_selections` is keyed on `(orderId, menuWeekId, dayOfWeek, slot, personIndex, pickIndex)` — **no `deliveryId`**. A customer changes the dish for a *weekday within the released week*; `applyToWeek` propagates one dish across that week's dates. No per-delivery override, no customer-editable weekly default (the default is staff-authored `menu_items.isDefault`).
- **Cutoff fully modeled + enforced:** `deliveries.cutoffAt` (snapshot, set at materialization via `cutoffMsFor(dateIso, cutoffHour, timezone)` = the `cutoffHour`:00 wall-clock instant the day *before* delivery). Enforced in `selections.service.ts` (~line 55: reads the scheduled delivery row's `cutoffAt`, throws "Selections are locked…" when `Date.now() > cutoffAt`) and in `deliveries.service.ts` mutations. `buildMealsGrid` exposes per-day `locked`/`lockMs`. The customer deliveries page already shows a *passive* "Cutoff passed" label — **no active countdown exists anywhere**.
- **What each slot offers:** categories (`dish_categories`, `enabled` + `selectable`) × `menu_items` for that week/day/slot, diet-filtered by plan, gated by `orders.categoryCounts[slot]` and multiplied by `orders.persons`. `selectable=false` categories are fixed (one read-only default cell); `selectable=true` render a picker per `pickIndex` up to the count.
- **No customer meal photos in the picker today** — `buildMealsGrid` options carry dish name/id, not image. Slice-1 added dish images (`dishes.image`) + `<DishImage>`; the picker needs the option shape extended to carry the image (mirrors the Slice-1 `getPublishedWeek` change).

## Decisions (locked)

- **Photo-driven customer picker** — reuse the `buildMealsGrid` grid model + `selectionsService`/`pickDish` engine; build a NEW customer-styled picker that shows **dish photos** per option (via `<DishImage>`). Do not reuse the staff `meals-grid.tsx` UI.
- **Dedicated `/me/meals` route** + a cutoff countdown banner pinned on top; linked from the customer nav.
- **Primary/first active order now; multi-order switcher deferred** (a customer with multiple active subscriptions sees their primary order's meals; a subscription switcher is an explicit follow-up).
- **No DB schema change** (engine + `meal_selections` exist). Backend touch = extend the grid option shape to carry dish image + a customer-gated action.

## Design

### A. Backend (mostly reuse)
- **Extend the grid slot-option shape to carry the dish `image`.** `GridCell.dishes` options already carry `{ id (dish publicId), name, diet }` (`meals-grid.ts:12,22`) — only the image is missing. Add it in **three spots**: the dish `db.select` (`meals-grid.ts:99-104`, add `image: dishes.image`), the `dishMap` value (`:107`), and the `GridCell.dishes` element type (`:22` → `{ id; name; diet; image: FileDetail | null }`). Additive — the staff grid ignores the extra field. `WeekDateView` already exposes the cutoff instant as `lockMs` (`:26`) for the banner. This mirrors the Slice-1 `getPublishedWeek` image extension.
- **New `app/(customer)/me/meals/actions.ts`:** `pickMyDish` + `applyMyDishToWeek`. Resolve `userId` from session (`currentUserId()`), `assertOwnsOrder(userId, orderPublicId)` (Slice-4 pattern), delegate to `selectionsService.setSelection`/`applyToWeek`, `revalidatePath("/me/meals")`. The server re-checks the cutoff lock (the service already throws when locked) — the client surfaces that error.

### B. Route + nav
- **`app/(customer)/me/meals/page.tsx`** — mirrors `dashboard/meals/page.tsx`'s loader: resolve the customer's **primary active order** (the first of `myActiveSubscriptions(userId)`), the released `menu_weeks` for its plan type, and `buildMealsGrid(order, {timezone, cutoffHour})` from app settings. Pass grid + cutoff data to the client picker. Already role-gated by the `(customer)` layout; no `proxy.ts` change.
- **Nav entry** — add a "Meals" item to `CustomerBottomNav` + `CustomerSidebar` using the Slice-0 `<TransitionLink>`.

### C. New components (`components/customer/meals/`)
- **`<CutoffBanner>`** (`"use client"`) — live countdown to the **soonest still-editable** cutoff among the week's days (min `WeekDateView.lockMs` where `Date.now() < lockMs`), formatted "⏱ 4h 12m to change <weekday>'s meals". Ticks client-side (`setInterval`, cleared on unmount); reduced-motion → no pulse animation but still updates. When every day is locked → "This week's meals are locked." When nothing to edit / no order → not rendered.
- **`<MealPicker>`** (`"use client"`) — week grouped by day; per day the selectable categories, each rendering its options as **tappable dish-photo cards** (`<DishImage>` + name + selected check). Tap → optimistic select → server action → `revalidate`; on a cutoff-lock/validation error, revert + toast. Locked days and `selectable=false` categories render read-only (photo + name, no tap). An "Apply to the whole week" control per pick (calls `applyMyDishToWeek`). `Reveal.Group` stagger, `Pressable` cards.
- **Empty states** (`<LottieEmptyState>`): no active order → "Subscribe to plan your meals" + `/subscribe` CTA; active order but no released week → "This week's menu isn't out yet."

### D. Motion (Slice 0/1 reuse — no new deps)
`Reveal.Group` on day sections + option grids; `Pressable` option cards; `<DishImage>` photos with gradient fallback; live banner tick; reduced-motion honored throughout.

## Data flow
`me/meals/page.tsx` (server): `currentUserId()` → `myActiveSubscriptions(userId)` → primary order → app settings (`timezone`, `cutoffHour`) → released `menu_weeks` → `buildMealsGrid(order, …)` (with image-extended options) → render `<CutoffBanner days={…}/>` + `<MealPicker grid={…} orderPublicId={…}/>`. Picks POST through `pickMyDish`/`applyMyDishToWeek` (server-gated), which revalidate the route.

## Non-goals
- Multi-order/subscription switcher (deferred — primary order only).
- Per-delivery meal override or a customer-editable weekly default (engine is per-week-day; default is staff-authored).
- Any DB schema/enum change; any change to the staff `dashboard/meals` picker.
- Wallet (Slice 3), country-code/subscribe (Slice 5).

## Testing / verify contract
- **Component tests** (jsdom, mock motion + actions): `MealPicker` renders selectable options + marks the chosen one, fires the pick action on tap, renders locked/fixed cells read-only; `CutoffBanner` formats the countdown to the soonest editable cutoff, shows the all-locked message, and (reduced-motion) still renders a static countdown.
- **Action test** (live-DB, Slice-4 harness): `pickMyDish` rejects a non-owned order with `NotFoundError` (IDOR) and writes the selection for the owner; a locked day rejects with the service's lock error.
- Reuse the existing `selectionsService`/`buildMealsGrid`/`resolveDeliveryMeal` tests unchanged.
- `pnpm turbo typecheck && pnpm turbo test`.
- Eyeball: `"use client"` on picker/banner; picks persist + resolve on the deliveries page; reduced-motion stops the banner pulse; picking a locked day is rejected and reverts.

## Risks
- **Multi-order customers** see only the primary order's meals until the switcher ships — flag in the UI ("Showing <plan> — switcher coming").
- **Sparse dish photos** — options without an image use `<DishImage>`'s gradient fallback (already handles it).
- **Optimistic pick vs server lock** — the server is the source of truth; the client must revert + toast on rejection (never leave a fake-applied pick).
- **Cutoff correctness** is inherited from `cutoffMsFor` + the snapshot `cutoffAt` — the banner only *reads* it, never recomputes, so it can't drift from enforcement.
