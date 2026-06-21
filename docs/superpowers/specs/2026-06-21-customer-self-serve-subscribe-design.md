# Slice 2 — Customer Self-Serve Subscribe (complete + correct)

**Date:** 2026-06-21
**Status:** Approved (design)
**Initiative:** Customer subscription product ("CRM" feature work) — Slice 2 of 4
**Depends on:** Slice 1 (plan-type + per-tiffin pricing foundation), merged.

## Context

The customer self-serve subscribe flow already exists: a 4-step wizard
(`apps/web/components/wizard/`: `wizard.tsx` + `steps/step-baseline`, `step-bundle`,
`step-schedule`, `step-duration`, `invoice.tsx`, `selections.ts`) feeding
`(public)/subscribe` → `(public)/checkout` → `(public)/activate/[deploymentId]`. Slice 1
rewrote pricing to per-tiffin and added `plans.planType` + `plans.offeredSlots`.

This slice completes and corrects that flow against the business model. It does NOT build
the wizard from scratch.

## Goal

Add start-date selection (the missing core input), make the slot picker plan-type aware
(the gap deferred from Slice 1), remove stale discount UI, and improve pricing transparency
and copy.

## Decisions (locked during brainstorming)

- **Start date:** any weekday; **never Saturday or Sunday**. Allowed start weekdays are
  **configurable per plan** ("group of meals") via `plans.allowedStartDays` (default Mon–Fri).
- **Earliest start:** the next weekday after today (skip weekends). Fixed rule, no config.
- Weeks run **rolling from the start date** (not calendar-Monday). Mapping a rolling start
  to Monday-start menu weeks is Slice 3's concern; this slice only captures + validates the date.
- **Wizard structure:** start date goes into the existing **Duration step** (renamed
  "Start & duration") — no new step.
- Per **TD-1** (`docs/product/tech-decisions.md`): framework-agnostic date/weekday helpers
  go in `@tiffin/commons`; the plan-specific start-date rule stays in the app service
  (mirroring `validateOrderSlots`).

## Schema changes

### `orders` (`db/schema/orders.ts`)
- Add `startDate` — `date("start_date").notNull()`.

### `plans` (`db/schema/catalog.ts`)
- Add `allowedStartDays` — `text("allowed_start_days").array().notNull().default(["mon","tue","wed","thu","fri"])`.
- Surface `allowedStartDays` in the catalog snapshot (`CatalogSnapshot.plans` +
  `ClientCatalogSnapshot.plans`) and `lib/catalog/load.ts`.
- Admin: add `allowedStartDays` to the plans resource config as a **multiselect** of weekday
  options (per TD-3), not free-text/CSV.

## Validation

### `@tiffin/commons` — generic weekday helpers (per TD-1)
- `weekdayKey(date: Date): "mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun"` — the weekday key for a date.
- `nextWeekday(from: Date): Date` — the next calendar day after `from` that is Mon–Fri.

### App service — `lib/services/start-date.ts`
- `validateStartDate(startDate: string, allowedStartDays: string[], today: Date): void`
  throws `ValidationError` when:
  - the date is before the next weekday after `today` (past or too soon),
  - the date's weekday is Saturday or Sunday,
  - the date's weekday is not in `allowedStartDays`.
- `today` is injected for testability (no `Date.now()` in the pure path).

### Wiring
- `createOrder` (`lib/services/orders.service.ts`) calls `validateStartDate(input.selections.startDate,
  plan.allowedStartDays, new Date())` alongside `validateOrderSlots`, before pricing, and writes
  `startDate` to the order.
- `CreateOrderInput.selections` / `PricingSelections` carry `startDate: string` (ISO `YYYY-MM-DD`).
  Note: pricing does not use `startDate`; it rides along in selections for order creation. If
  threading it through `PricingSelections` proves awkward, carry it on `CreateOrderInput` directly
  instead — the implementer picks the cleaner wiring and documents the choice.

## UI changes (wizard)

### A. Start date — `step-duration.tsx` (→ "Start & duration")
- Add a date input above the weeks selector. Constrain client-side: `min` = next weekday after
  today; disable/reject Saturdays, Sundays, and weekdays not in the selected plan's
  `allowedStartDays`. Show a hint listing allowed start days.
- Store as `selections.startDate` (ISO `YYYY-MM-DD`).

### B. Plan-type slots — `step-schedule.tsx` + `step-baseline.tsx`
- `step-schedule` renders only `enabledSlots ∩ plan.offeredSlots` (look up the selected plan from
  `catalog.plans` by `selections.planKey`).
- `planType === "tiffin"` → single-select (radio), exactly one slot. `healthy` → checkboxes within
  offered slots, at least one.
- `step-baseline` on plan change resets `selections.mealSlots` to the new plan's default: for tiffin,
  its single offered slot; for healthy, the offered slots intersected with enabled (or the first).
- Server already enforces via `validateOrderSlots` (Slice 1) — this aligns the client so users
  can't reach a dead-end.

### C. Remove stale discount UI — `step-duration.tsx`
- Drop the `d.discountPct` "(5%)" label from the weeks options (duration discount no longer affects price).

### D. Transparency — `invoice.tsx`
- Show tiffin count, per-tiffin rate, the current volume tier, and a nudge ("Order 20+ tiffins for the
  best per-tiffin rate") when the matched tier is not the top (0%-uplift) band. The tier is already in
  `PricingResult.tier`.

### E. Copy — `wizard.tsx` / steps
- "Deploy Plan Formulation" → "Continue to checkout". Tidy step labels/headings to plain language.

### F. Catalog admin revamp (TD-3)
Revamp the whole catalog editor (`app/(dashboard)/dashboard/catalog/`) so every field uses a
typed control. The editor is config-driven from a `FieldDef` config (`resource-config.ts`) with
`FieldType = text | number | csv | select`. Extend and re-audit:

**Field-type additions:**
- `multiselect` — renders checkboxes/chips from options, persists `text[]`. Options come from
  either a static list (`options`) or a dynamic source (`optionsSource`) resolved server-side.
- `date` — renders a date input, persists ISO `YYYY-MM-DD`.
- Add matching handling in `rowToFields` / `fieldsToPatch`. `[resource]/page.tsx` resolves any
  `optionsSource` (e.g. load enabled `mealSlots` keys) and passes resolved options into
  `ResourceEditor`.

**Dynamic options (references to pre-existing rows):**
- `optionsSource: "mealSlots"` → enabled slot keys from the `mealSlots` table.
- `optionsSource: "weekdays"` → `["mon","tue","wed","thu","fri","sat","sun"]` (static set,
  modeled as a source for symmetry).

**Per-resource control audit** (change only what's wrong; leave conforming fields):

| Resource | Field | Control |
|----------|-------|---------|
| plans | key, name, description | text (open) |
| plans | planType | select (already) |
| plans | offeredSlots | **multiselect** ← was CSV; options from `mealSlots` |
| plans | allowedStartDays | **multiselect**, options `weekdays` (new field) |
| meal-sizes | key, name | text (open) |
| meal-sizes | tier, diet | select (already) |
| meal-sizes | components | csv (genuinely open free-text list) |
| meal-sizes | kcalMin/Max, protein/carbs/fat, basePrice | number (already) |
| addons | key, name | text; pricePerWeek number |
| delivery-frequencies | key, name | text; daysPerWeek number |
| duration-packages | weeks | number |
| delivery-zones | name, slotWindow | text; postalPrefixes csv (open list) |
| pricing-tiers | minQty, maxQty, upliftPct | number |

**Deprecated fields:** `delivery-frequencies.courierDiscountPct` and
`duration-packages.discountPct` no longer affect pricing (Slice 1). Remove them from the
editor config (the columns stay in the DB for the later cleanup slice) so admins aren't shown
knobs that do nothing.

**User-friendliness — every control (required):** audit each field so the admin never sees a
raw/unfriendly input:
- **Human labels, not keys.** Options render readable labels mapped from their stored value:
  weekday `mon` → "Monday"; slot key → its `mealSlots.label`; enum `premium` → "Premium",
  `nonveg` → "Non-veg". The stored value stays the key; only the display is friendly.
- **Units/affordances on numbers.** Show the unit inline: `basePrice`/`pricePerWeek` as currency
  (`$`), `upliftPct` as `%`, `kcalMin/Max` as `kcal`, macros as `g`, `weeks`/`daysPerWeek`/qty
  as plain integers with `min` bounds. Use `step`/`min` so the input guides valid entry.
- **Clear required vs optional**, with short helper text where a field needs context (e.g.
  pricing-tiers "blank max = unbounded top band"; allowedStartDays "days a subscription may start").
- **Sensible widgets:** select/multiselect for known sets, date picker for dates, number for
  numerics, csv only for genuinely open lists (components, postalPrefixes). No free-text where a
  control fits.
- Reuse `apps/web/components/ds/` and existing `components/ui/` primitives for a consistent look.

**Remove unused catalog items:** the per-tiffin model retired some catalog data — remove it from
the admin so operators aren't shown dead settings:
- **`addons`** (Saturday/Sunday $/week specials) — no longer used: pricing is all-in per-tiffin and
  weekends just add delivery days. Remove the `addons` resource from `RESOURCES` + `TABLES` + nav,
  and stop seeding it (`seed-catalog.ts`). The `addons` table + `pricePerWeek` column stay in the DB
  for the later deprecated-column cleanup slice; only the admin surface and seed are removed.
- **`delivery-frequencies.courierDiscountPct`** and **`duration-packages.discountPct`** — removed
  from the editor (above); columns remain for later cleanup.
- Before removing each, the implementer greps for remaining references; if any live code still reads
  it, keep it and flag instead of removing.

## Data flow

`subscribe/page.tsx` already passes the catalog (now incl. `planType`/`offeredSlots`/`allowedStartDays`)
and enabled slots to `Wizard`. `Wizard` keeps `selections` (now incl. `startDate`), reprices via the
existing `reprice` server action, persists `selections` to `sessionStorage`, and `checkout` reads it and
calls `confirmSubscription` → `createOrder`. `startDate` flows through unchanged plumbing.

## Testing

- **`@tiffin/commons`**: `weekdayKey` (each day), `nextWeekday` (Fri→Mon, Sat→Mon, mid-week→next day).
- **`validateStartDate`**: weekend reject, past/too-soon reject, next-weekday boundary accept,
  allowed-day membership reject/accept.
- **Slot picker**: tiffin renders single-select and blocks multi; healthy honors offered subset;
  plan change resets mealSlots.
- **Order creation**: an order persists `startDate`; invalid start date is rejected before write.
- Full green gate: `pnpm test && pnpm typecheck && pnpm build`. Migration generated + applied; reseed.

## Out of scope

- Per-day meal-selection form + rolling day-before cutoff (Slice 3) — including the rolling-start →
  menu-week mapping.
- Agent CRM subscription management (Slice 4).
- Coupons (own slice).
- Removing deprecated discount columns (later cleanup).
