# Slice 1 — Plan-type + Pricing Foundation

**Date:** 2026-06-21
**Status:** Approved (design)
**Initiative:** Customer subscription product ("CRM" feature work)

## Context

Tiffin Grab sells meal-plan subscriptions. A customer picks a plan, a start date,
a number of weeks, optional Saturday/Sunday, and a delivery frequency; the system
computes a price and creates an order. After ordering, the customer picks specific
dishes per day (currently an external JotForm; to be replaced in-app in a later slice).

Much of the backend already exists:

- **Catalog:** `plans`, `mealSizes` (tier/diet/components/kcal/macros/basePrice),
  `addons`, `deliveryFrequencies`, `durationPackages`, `deliveryZones`.
- **Orders:** subscription `orders` + `payments`.
- **Menu engine (Subsystem E):** `menuWeeks` / `menuItems` / `dishes` + admin builder.
- **Meal selection:** `mealSelections` + `selections.service` (per-week cutoff, dish/diet validation).
- **Pricing engine:** `priceSubscription` — weekly-fee × weeks with courier/student/loyalty %-discounts.
- **Customer flow:** `(public)/checkout`, `(public)/activate/[deploymentId]`.

The full initiative spans four independently-shippable slices:

1. **Plan-type + pricing foundation** ← this spec
2. Customer self-serve customize & subscribe (catalog → customize → checkout)
3. Per-day meal-selection form + rolling day-before cutoff (JotForm replacement)
4. Agent CRM management of subscriptions/customers

Slices 2–4 depend on the type + pricing decisions made here, so this slice goes first.

## Goal

Replace the weekly-fee pricing model with **per-tiffin, volume-tiered pricing**, and
generalize plans into **two types** (`tiffin`, `healthy`). Catering is deferred.

## Decisions (locked during brainstorming)

- **Pricing model:** per-tiffin, all-in (delivery included). Replaces the weekly-fee
  model and removes courier/student/loyalty %-discounts entirely.
- **Tiffin count:** `(delivery-days/wk + Sat? + Sun?) × weeks × persons`. **Slot-agnostic** —
  a healthy day with 3 slots is still 1 tiffin (single delivery for all slots).
- **Volume pricing:** per-tiffin price drops with total quantity via a global **%-uplift
  tier table**; the top band (e.g. 20+) is 0% uplift, i.e. `mealSize.basePrice` is the best rate.
- **Plan types:** explicit `planType` enum + `offeredSlots` per plan. Tiffin = one fixed
  slot; healthy = customer picks a subset of `offeredSlots` at subscribe time.
- **Delivery frequency:** sets delivery-days/wk only; fewer days = fewer tiffins = cheaper.
  No separate delivery fee.
- **Catering:** out of scope for this slice.

## Schema changes

### `plans` (`db/schema/catalog.ts`)
Add:
- `planType` — `pgEnum("plan_type", ["tiffin", "healthy"])`, NOT NULL, default `"tiffin"`.
- `offeredSlots` — `text("offered_slots").array()`, NOT NULL, default `[]`. Holds
  `mealSlots.key` values. Tiffin plans carry one key; healthy plans carry several.

### `pricingTiers` — new table (`db/schema/catalog.ts`)
`updatableColumns("ptr")` plus:
- `minQty` — `integer`, NOT NULL (inclusive lower bound).
- `maxQty` — `integer`, nullable (inclusive upper bound; `null` = unbounded top band).
- `upliftPct` — `numeric(5,2)`, NOT NULL (percent added to base price; `0` = best rate).
- `active` — `boolean`, NOT NULL, default `true`.

Invariant: active bands are contiguous, cover `1 → ∞`, no gaps/overlaps, exactly one
unbounded (`maxQty = null`) top band, all `upliftPct ≥ 0`.

### `orders` (`db/schema/orders.ts`)
- **Drop** `weeklyFee`, `isStudent`.
- **Add** `tiffinCount` — `integer`, NOT NULL.
- **Add** `perTiffinPrice` — `numeric(10,2)`, NOT NULL.
- **Keep** `total`, `pricingSnapshot`, `planId`, `mealSizeId`, `frequencyId`, `persons`,
  `mealSlots`, `includeSaturday`, `includeSunday`, `durationWeeks`, address fields, etc.

### Deprecations (kept, no longer read by pricing — cleanup in a later slice)
- `deliveryFrequencies.courierDiscountPct`
- `durationPackages.discountPct`

`deliveryFrequencies.daysPerWeek` and `durationPackages.weeks` remain in use.

## Pricing engine (`lib/pricing/engine.ts` + `types.ts`)

Rewrite `priceSubscription`:

```
deliveryDays = frequency.daysPerWeek + (includeSaturday ? 1 : 0) + (includeSunday ? 1 : 0)
tiffinCount  = deliveryDays × durationWeeks × persons
tier         = active band where minQty ≤ tiffinCount ≤ (maxQty ?? ∞)
perTiffin    = round2(mealSize.basePrice × (1 + tier.upliftPct / 100))
total        = round2(perTiffin × tiffinCount)
```

- Remove `STUDENT_DISCOUNT_PCT`, courier discount, loyalty/duration discount, and the
  slot-count multiplier.
- `PricingCatalog` gains the resolved tier list; loses the discount-related fields.
- `PricingResult` returns `{ tiffinCount, perTiffinPrice, subtotal, adjustments, total, tier, lineItems }`.
  `adjustments: PricingLine[]` is the **coupon hook** — always `[]` in this slice; a future
  coupon slice pushes discount lines into it and `total = subtotal − Σadjustments`. Baking it
  in now means coupons slot in with no engine signature change.
- `pricingSnapshot` stores the breakdown: `basePrice`, matched tier (`minQty/maxQty/upliftPct`),
  `perTiffinPrice`, `tiffinCount`, `deliveryDays`, `total`.
- If no tier matches (misconfigured table), throw `ValidationError` — pricing must not
  silently fall through.

## Plan-type behavior

- `offeredSlots` is the source of truth for which slots a plan supports.
- Order validation: `order.mealSlots` must be a non-empty subset of `plan.offeredSlots`.
  For `planType = "tiffin"`, exactly one slot.
- The selection UI that consumes `offeredSlots` per day is **slice 3**; this slice only
  stores the field and enforces the subset/cardinality rule at order creation.

## Services

- **`catalog.service`:** CRUD for `plans` (incl. `planType`, `offeredSlots`) and a new
  `pricingTiers` resource with contiguity/overlap validation on write.
- **`orders.service`:** switch to the new engine + order shape (`tiffinCount`,
  `perTiffinPrice`, no `weeklyFee`/`isStudent`).

## Admin UI (catalog)

- **Plans editor:** add `planType` selector + `offeredSlots` multiselect (from enabled `mealSlots`).
- **Pricing Tiers editor** (new, under the catalog area): list/add/edit/remove bands and
  uplift%, with client + server validation of the contiguity invariant.
- Use existing `ds/` design-system components.

## Wire-up (required for a green build)

`(public)/checkout` and any order-creation path must move to the new pricing shape so the
project type-checks and builds. Update price display to show per-tiffin × count → total,
and the tier in effect.

## Migration + seed

- Drizzle migration for: `plan_type` enum, `plans.planType` + `plans.offeredSlots`,
  `pricing_tiers` table, `orders` column changes.
- Seed `pricingTiers` (placeholder, admin-tunable):
  `1–11 → +20%`, `12–19 → +10%`, `20+ → 0%`.
- Seed plans with explicit types: a tiffin plan (single slot, e.g. `["lunch"]`) and a
  healthy plan (`["breakfast","lunch","dinner"]`).
- Update `db:seed:catalog` accordingly. Dev DB migrates fresh; reseed after
  (`db:seed && db:seed:catalog && db:seed:menu && db:seed:admin`).

## Testing

- **Pricing engine unit tests:** tier boundaries (11/12/19/20/24), Saturday/Sunday day
  adds, persons multiplier, weeks multiplier, slot-agnostic count (healthy 3-slot day = 1
  tiffin), unmatched-tier error.
- **Validation tests:** `mealSlots ⊆ offeredSlots`, tiffin single-slot rule.
- **Tier validation tests:** reject gaps, overlaps, missing unbounded top band, negative uplift.

## Out of scope

- Customer self-serve subscribe UI (slice 2).
- Per-day meal-selection form + rolling day-before-6pm cutoff (slice 3).
- Agent CRM subscription/customer management (slice 4).
- Catering plan type.
- **Coupons / promo discounts** — their own later slice. This slice only bakes the
  `adjustments` hook into `PricingResult` so that slice needs no engine signature change.
- Removing deprecated discount columns (later cleanup).
