# Slice 3 — Per-day Meal Selection + Rolling Cutoff (JotForm replacement)

**Date:** 2026-06-22
**Status:** Approved (design)
**Initiative:** Customer subscription product ("CRM" feature work) — Slice 3 of 4
**Depends on:** Slice 1 (per-tiffin pricing) + Slice 2 (start date, plan types), merged.

## Context

Customers need to pick the actual dish for each delivery day of their subscription — the
in-app replacement for the external `custom-allocation-form-v3` survey currently linked from
the `activate` page.

What already exists:
- `dashboard/meals` page + `meals/actions.ts` (`pickDish`) + `MealsGrid` — a working selection
  grid, but it shows the **single latest released week** with a **per-week** cutoff
  (`menuWeeks.orderCutoff`), and ignores the subscription's `startDate` / `durationWeeks`.
- `selections.service` (`setSelection` enforces per-week cutoff + dish/diet validity;
  `effectiveSelections`), `mealSelections` table (keyed by order, menuWeek, dayOfWeek, slot, personIndex).
- `menuWeeks` (Mon-start `weekStart`, `status` draft/released, `orderCutoff` epoch-ms) + admin builder.
- `orderDeliveryDays(order)` → weekday list (Mon–Fri ± Sat/Sun) in `lib/menu/delivery-days.ts`.
- `lib/format/datetime.ts` `formatEpoch(ms, { timeZone, mode })`.
- `orders.startDate`, `orders.durationWeeks`, `orders.persons`, `orders.mealSlots`.

## Goal

Let a customer pick dishes for their **coming service week** only, scoped to their
subscription's real delivery dates, with a **rolling per-day cutoff** (configurable hour, app
timezone, day-before), and point them in-app instead of the external survey.

## Decisions (locked during brainstorming)

- **Cutoff:** each delivery date D locks at `cutoffHour:00` on D−1, in the **app timezone**.
  `cutoffHour` + `timezone` are admin settings (defaults 18 / `America/Toronto`).
- **Time model (TD-4):** always store/compare **absolute epoch-ms**; on any conversion (cutoff
  wall-clock math or display) read the **app timezone** from settings. DST-correct via `Intl`
  (Toronto is UTC−5/−4). Customer/delivery timezone is the single anchor; staff location is not
  special-cased. Display delivery times labeled with the zone (e.g. "Fri 6:00 PM EST").
- **Delivery dates:** count-matched rolling — the first `durationWeeks × deliveryDaysPerWeek`
  occurrences of the order's delivery weekdays on/after `startDate`. Matches the priced tiffin count.
- **Form scope:** menus may be uploaded for many future weeks, but the selection form is open
  for the **coming service week only** (the released `menuWeek` for the upcoming week relative to
  "now" in the app timezone). Other future released weeks are not form-open.
- **App timezone is a finalized setting** used for every conversion.

## Schema changes

### `appSettings` — new singleton table (`db/schema/`, `updatableColumns("aps")`)
`updatableColumns(...)` plus:
- `timezone` — `text`, NOT NULL, default `"America/Toronto"`. The app-wide conversion timezone.
- `cutoffHour` — `integer`, NOT NULL, default `18`. 0–23, the day-before lock hour (wall-clock in `timezone`).

Exactly one row. A service `getAppSettings()` returns it (or the defaults if the table is empty).
Seeded once (extend `db/seed.ts` or `seed-admin.ts`).

`menuWeeks.orderCutoff` stays (admin builder still sets it) but **no longer gates customers** —
the customer cutoff is computed per-day from `appSettings`.

## Commons (`@tiffin/commons`, per TD-1)

- `cutoffMsFor(deliveryDateIso: string, cutoffHour: number, timezone: string): number` — epoch-ms
  of `cutoffHour:00` wall-clock in `timezone`, on the day **before** `deliveryDateIso`. Uses a
  DST-aware offset derived per-instant from `Intl` (helper `tzOffsetMinutes(timezone, utcMs)`),
  never a hardcoded offset.
- `tzOffsetMinutes(timezone: string, utcMs: number): number` — the zone's offset (minutes) at that
  instant, via `Intl.DateTimeFormat` parts compared to UTC.

## Display (`lib/format/datetime.ts`)

- Extend `formatEpoch` so a flag includes the zone label (`timeZoneName: "short"`), e.g.
  `formatEpoch(ms, { timeZone, mode, withZone: true })`.
- Add `formatDeliveryTime(ms: number, timezone: string): string` → labeled datetime in the app
  timezone (used for cutoff/delivery times shown to customers).

## Delivery-date derivation (`lib/menu/delivery-dates.ts`)

- `subscriptionDeliveryDates(input: { startDate: string; durationWeeks: number; deliveryDays: DayOfWeek[] }):
  { dateIso: string; dayOfWeek: DayOfWeek; weekStartIso: string }[]` — starting from `startDate`,
  walk forward, emitting each calendar date whose weekday is in `deliveryDays`, until
  `durationWeeks × deliveryDays.length` dates are collected. `weekStartIso` = the Monday of that
  date's calendar week (for menu-week mapping). Pure; uses `@tiffin/commons` date helpers.

## Coming-week selection (meals page)

- Compute "today" in the app timezone; the **coming service week** = the calendar week starting
  the upcoming Monday (the week menus are released for). Find the released `menuWeek` whose
  `weekStart` equals that Monday. If none → "menu not published yet."
- Build `subscriptionDeliveryDates` for the active order; intersect with the coming week's dates →
  the editable cells. Show real dates (not bare weekdays).
- For each cell, `lockMs = cutoffMsFor(dateIso, cutoffHour, timezone)`; editable iff `Date.now() < lockMs`,
  else read-only with a lock badge showing the cutoff via `formatDeliveryTime`.
- Empty/edge states: no active subscription; subscription not yet started / already ended (no
  delivery dates in the coming week); coming week not released.
- Per-person, per-slot picking as today; default = the menu item marked `isDefault`.

## `selections.service.setSelection`

- Replace the per-week cutoff check with per-day: derive `dateIso` from
  `menuWeek.weekStart + dayOfWeek` offset, load `appSettings`, reject if
  `Date.now() > cutoffMsFor(dateIso, cutoffHour, timezone)` ("Selections are locked — the cutoff for
  that day has passed").
- Reject a `(dayOfWeek)` whose derived date is **not** in the order's `subscriptionDeliveryDates`
  set ("That day isn't part of your subscription").
- Keep existing dish-availability + diet checks. (Diet check via `dietsForPlanKey` already tolerates
  unknown plan keys → both diets; no change required for healthy plans.)

## activate page

Replace the external `custom-allocation-form-v3` link block with in-app guidance: once active, log
in and open **My Meals** (`/dashboard/meals`) to choose dishes for the coming week before the cutoff.

## Admin settings

- New `/dashboard/settings/general` page: edit `appSettings` — `timezone` (TD-3 **select** of common
  zones, incl. `America/Toronto`) + `cutoffHour` (number input, 0–23). Add a card to the Settings hub.

## Testing

- **`cutoffMsFor`** (commons): day-before subtraction; a winter date and a summer date differ by
  exactly the DST hour; correct epoch for a known Toronto instant.
- **`tzOffsetMinutes`**: −300 (winter) / −240 (summer) for `America/Toronto`.
- **`subscriptionDeliveryDates`**: count = `durationWeeks × deliveryDays.length`; starts on/after
  `startDate`; correct weekday filtering; spills across calendar weeks; `weekStartIso` is the Monday.
- **`setSelection`**: accepts a pick before cutoff; rejects after cutoff; rejects a day outside the
  subscription set; (existing dish/diet checks still pass).
- Full gate: `pnpm test && pnpm typecheck && pnpm build`. Migration generated + applied; reseed.

## Out of scope

- Multi-week-ahead customer navigation (menus release one week out; form-open = coming week only).
- Sweeping ALL staff-facing timestamps to the app timezone (recorded follow-up; this slice covers
  customer/delivery + cutoff times).
- Agent CRM subscription management (Slice 4), coupons, catering, deprecated-column DB cleanup.
