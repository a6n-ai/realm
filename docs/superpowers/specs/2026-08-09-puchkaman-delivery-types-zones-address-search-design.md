# puchkaman delivery types, delivery zones, and Google address search

**Date:** 2026-08-09
**Status:** Approved design, not yet planned
**Supersedes:** `2026-08-08-puchkaman-delivery-zones-address-search-design.md` (single-zone model)
**Scope:** `apps/puchkaman` only. No shared package yet, no tiffin-grab change.

## Problem

Four weaknesses in puchkaman's delivery flow, which resolve into one change:

1. **A geolocation button that does nothing.** `components/order/order-direct-cta.tsx` asks for
   `navigator.geolocation`, computes a distance, renders a message, and discards the coordinates.
   Every branch links to the same `/checkout?fulfillment=delivery`.
2. **Free-text addresses geocoded by a keyless third party.** Checkout takes a `<textarea>`
   (`checkout-client.tsx:374`) resolved through OpenStreetMap Nominatim (`lib/delivery/geocode.ts:15`).
   `orders.service.ts:549-551` throws when that returns `null`, so **Nominatim being down takes
   delivery checkout offline.**
3. **Delivery rules hardcoded.** `lib/delivery/distance.ts:4-6` fixes a 7 km radius, a 15% discount
   and a $35 minimum. Changing any of them is a code deploy.
4. **The customer is never offered a choice.** Today the fulfilment tier is derived silently from
   distance. The customer cannot see that a scheduled delivery is available, or choose it.

## Goals

1. **Delivery types as data** — pickup, instant, scheduled today; more addable later without a
   deploy. Each carries its own rules.
2. **Delivery zones as data** — radius from the shop, each offering one or more delivery types.
3. **Address first, then choose.** Checkout asks for the address, resolves it, and offers the
   delivery types actually available at that distance.
4. Replace the geolocation prompt with Google Places search, on checkout and a public checker.
5. Remove Nominatim from the critical path without removing it as a fallback.

## Non-goals

- **No delivery fee.** Clover's atomic-order line items require a real catalogue `itemId`, and no
  "delivery fee" item exists — a fee column could be priced and stored but never charged, silently
  underbilling every order in that zone. The operator confirmed there is no fee. No column, no trap.
- Lead capture for out-of-area customers. puchkaman has no inquiries model. Out of range means
  pickup only.
- Driving distance. Straight-line (haversine), as today.
- Polygon or postal-code zones.
- **Any change to tiffin-grab.** See "On sharing with tiffin-grab" below.

## Key decisions

| Decision | Choice | Why |
|---|---|---|
| Types | A table, not an enum | Operator must add types without a deploy |
| Zone→type | Many-to-many join | A near address offers instant *and* scheduled; a far one only scheduled |
| Rules live on | The type | A type's minimum and discount are properties of the service, not the geography |
| Distance owned by | The zone | Radius is geography |
| Out of every zone | Pickup only | No inquiries model; refusing delivery still leaves a sale |
| Maps SDK | Google (`@react-google-maps/api`) | Native editable `<Circle>`; one SDK for autocomplete + admin map |
| Keys | New browser key, separate from the server reviews key | Autocomplete and Maps JS run client-side |

### On sharing with tiffin-grab

The operator raised making this shared. **Deliberately deferred, and designed for.**

tiffin-grab's zones are postal-prefix lists (`delivery_zones.postal_prefixes text[]`), it has no
store location, and no distance concept anywhere in the app. "Same tables" would mean migrating a
second production app onto a model it does not use. The repo's own rule is app-local until a second
client proves it shared.

So: table and column names carry **nothing puchkaman-specific**, and the matcher is a pure function
over structural types. When tiffin-grab adopts this, `lib/delivery/*` lifts into `@realm/delivery`
with the app supplying its own store — and by then we will know whether tiffin-grab wants radius
zones or keeps postal ones. Building the abstraction now, from one consumer, would guess wrong.

---

## Data model

### `delivery_types`

```ts
export const deliveryTypes = pgTable("delivery_types", {
  ...updatableColumns("dty"),
  /** Stable machine key: "pickup" | "instant" | "scheduled" | operator-defined. */
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  description: text("description"),
  /** Pickup needs no address; delivery types do. */
  requiresAddress: boolean("requires_address").notNull().default(true),
  /** Customer picks a time (scheduled). */
  requiresSchedule: boolean("requires_schedule").notNull().default(false),
  minSubtotal: numeric("min_subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
  discountPct: numeric("discount_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  /** Display order in the checkout picker. */
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});
```

Seeded rows reproduce today's live behaviour exactly:

| key | label | requiresAddress | requiresSchedule | minSubtotal | discountPct |
|---|---|---|---|---|---|
| `pickup` | Pickup | false | false | 0 | 0 |
| `instant` | Instant delivery | true | false | 0 | 15.00 |
| `scheduled` | Scheduled delivery | true | true | 35.00 | 0 |

### `delivery_zones`

```ts
export const deliveryZones = pgTable("delivery_zones", {
  ...updatableColumns("zon"),
  name: text("name").notNull(),
  radiusKm: numeric("radius_km", { precision: 6, scale: 2 }).notNull(),
  active: boolean("active").notNull().default(true),
});
```

A zone is **geography only** — no rules. Seeded:

| name | radiusKm |
|---|---|
| Inner | 7.00 |
| Outer | 20.00 |

`20.00` is a real behaviour change: today scheduled delivery is accepted at *any* distance provided
the subtotal clears $35. It now stops at the largest zone. The operator should set the true figure
before deploy; adding a larger zone extends coverage with no migration.

### `delivery_zone_types` (join)

```ts
export const deliveryZoneTypes = pgTable("delivery_zone_types", {
  ...updatableColumns("dzt"),
  zoneId: bigint("zone_id", { mode: "bigint" }).notNull().references(() => deliveryZones.id),
  typeId: bigint("type_id", { mode: "bigint" }).notNull().references(() => deliveryTypes.id),
}, (t) => [uniqueIndex("delivery_zone_types_zone_type_unique").on(t.zoneId, t.typeId)]);
```

Seeded: Inner → `instant` + `scheduled`; Outer → `scheduled`.

So a 3 km address offers both; a 12 km address offers scheduled only; beyond 20 km, pickup only.

### Orders

```ts
deliveryTypeId: bigint("delivery_type_id", { mode: "bigint" }).references(() => deliveryTypes.id),
deliveryZoneId: bigint("delivery_zone_id", { mode: "bigint" }).references(() => deliveryZones.id),
```

No fee column. `delivery_lat` / `delivery_lng` already exist and are written but never read; they
start being read for the zone recheck. The `order_fulfillment` enum stays for historical rows and is
still written (`pickup` / `delivery_instant` / `delivery_scheduled`) by mapping from the type key,
so existing admin filters and Clover titles keep working.

`deliveryTypeId` and `deliveryZoneId` are asserted non-null at the persist site for delivery orders
rather than defaulted to `null` — a `?? null` fallback would turn a future query regression into
silently unattributed orders instead of a caught error.

### Store origin

`STORE_LAT` / `STORE_LNG` (`lib/delivery/distance.ts:2-3`) become nullable columns on the `app`
singleton, defaulting to the current constants. Every radius is measured from this point, so the
admin must be able to move it. The constants stay exported as defaults and for `lib/seo.ts:81-82`.

### Matching

```ts
/** Every active type offered at this distance, cheapest zone first, then type sortOrder. */
export function availableTypes(distanceKm: number, zones: ZoneWithTypes[]): DeliveryType[];

/** The zone a chosen type is served from — the smallest active zone offering it. */
export function zoneForType(distanceKm: number, typeKey: string, zones: ZoneWithTypes[]): Zone | null;

/** Furthest any zone reaches — the "we deliver up to N km" figure. */
export function deliveryLimitKm(zones: Zone[]): number | null;
```

All pure, no I/O, unit-testable without a database. `availableTypes` deduplicates: if two zones both
offer `scheduled`, the customer sees it once.

---

## Checkout flow

### Removed

`components/order/order-direct-cta.tsx` in full, plus its usage at `app/(marketing)/order/page.tsx:4,164`.

### New order of operations

Today the customer picks pickup-or-delivery up front and the tier is derived silently. Now:

```
1. Customer enters address (Places Autocomplete)  — or chooses Pickup and skips it
2. Server resolves place_id → lat/lng → distance
3. Server returns the delivery types available at that distance, with each one's
   minimum, discount, and whether it needs a time
4. Customer picks a type
5. Types whose minSubtotal exceeds the cart are shown but disabled, with the reason
```

Showing an unaffordable type disabled-with-reason rather than hiding it is deliberate: *"Scheduled
delivery — add $12 more to qualify"* converts, where a silently missing option does not.

### The trust boundary

```
client  →  { placeId, addressText, chosenTypeKey }   ← never lat/lng, distance, zone, discount
server  →  Places Details (server key)
        →  lat/lng → distance
        →  availableTypes()  →  re-verify chosenTypeKey is genuinely offered
        →  type's minSubtotal / discountPct applied server-side
```

The client picks a type **key**; the server re-derives whether that key is legitimately available at
that distance and re-reads its rules from the database. A client-supplied discount, distance or
coordinate pair would let anyone claim the 15% instant discount from any address.

### Resolution order

1. `place_id` → Places Details (authoritative; `place_id` is the one Places field Google permits
   caching indefinitely)
2. no `place_id`, or step 1 failed → Places text search
3. Google failed → Nominatim (existing `geocodeAddress`), retained as fallback
4. all failed → resolution returns `null` and checkout refuses that address

### Pricing

```
subtotal
  − type.discountPct × subtotal      → Clover discount line
  + tax                              → Clover computes
```

No fee. Clover remains the authority on the charged total.

### Gates

- `chosenTypeKey` not in `availableTypes(distance)` → reject (stale page or tampering).
- `subtotal < type.minSubtotal` → reject naming the type's minimum.
- `type.requiresSchedule && !scheduledFor` → reject asking for a time.
- No types available at that distance → delivery refused, pickup offered.

---

## Public address checker

`/order` loses the geolocation CTA and gains a checker answering the same question honestly:

```
✓ Yes — we deliver to 12 Elm St (2.4 km)
  · Instant delivery — 15% off
  · Scheduled delivery — orders over $35

✗ We don't deliver to 40 Bay St yet (24 km — we deliver up to 20 km)
  Pickup is available at 3315 Danforth Ave
```

The stated limit comes from `deliveryLimitKm`, never a hardcoded string, or it drifts the first time
an admin edits a radius. Both surfaces call the same endpoint, which takes a `place_id` and never
client coordinates.

---

## Admin — a Catalogue section

A new **Catalogue** group in the puchkaman dashboard sidebar, mirroring tiffin-grab's catalogue
pattern, containing two screens.

### Delivery types

A list with inline editing: label, description, minimum subtotal, discount %, requires-address,
requires-schedule, sort order, active. Operator can add a type. `key` is set once at creation and
immutable afterwards — order rows and the fulfilment mapping reference it.

### Delivery zones

Split pane: map left, zone list right.

- **Concentric circles from the shop pin**, one per zone, colour-matched to its list card.
- **Drag the edge handle to resize** — `<Circle editable onRadiusChanged>` returns metres, stored as km.
  Circle dragging disabled; zones are concentric by definition, only the shop pin moves.
- **The shop pin is draggable** and writes back to app settings.
- **Radius is also a number input.** Dragging explores; typing is exact. Never map-only.
- **Overlap prevented, not warned** — a zone cannot be resized past its neighbours, or the
  smallest-covering rule silently reorders which zone serves an address.
- **Each zone card carries type checkboxes** — this is where the join is edited.

Accessibility: every value editable from form fields with the map purely as visualisation; radius
input keyboard-reachable with arrow-key stepping; each circle carries an accessible name. A
drag-only editor is unusable by keyboard.

Zone and type deletion is **soft** (`active = false`). The hard `delete()` inherited from
`UpdatableService` must never be wired to a button — `orders.delivery_zone_id` and
`delivery_type_id` are `ON DELETE no action`, so hard-deleting a referenced row errors at the FK.

Admin order detail (`dashboard/orders/[id]/page.tsx:69-88`) gains the type and zone names.

---

## API keys

| Key | Where | Restrictions |
|---|---|---|
| `GOOGLE_PLACES_API_KEY` (exists) | Server only — reviews plugin, address resolution | API: Places. No referrer restriction. |
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY` (new) | Browser — autocomplete + admin map | **HTTP referrer restricted**; API: Maps JavaScript + Places; **daily quota cap** |

The public key is visible in page source by design; referrer restriction plus a quota cap is the
intended protection. Without the cap a copied key can run up a bill. The server key must never reach
client code, and the public key must never be used for the reviews call.

---

## Verification

- `availableTypes` unit tests: inside one zone, inside overlapping zones (dedupe), a type offered
  only by the outer zone, exactly on a boundary, beyond all zones (empty), inactive zone skipped,
  inactive type skipped, unsorted input.
- `zoneForType` returns the smallest zone offering the requested type; `null` when not offered.
- Pricing: discount computed from subtotal; no fee anywhere.
- Schema tests: checkout **rejects** client `lat`/`lng`/`distanceKm`/`discountPct`; a `chosenTypeKey`
  not available at the resolved distance is rejected server-side.
- Resolution order: `place_id`, text-search fallback, Nominatim fallback, all-fail.
- Numeric-string conversion at the service boundary — Drizzle returns `numeric` as a string, and a
  missing conversion passes loose comparison until two radii sort lexically.
- By eye: `"use client"` on map/autocomplete components; the public key never imported into a server
  module; the server key never imported into a client one.

## Operator steps

1. Create `NEXT_PUBLIC_GOOGLE_MAPS_KEY` — Maps JavaScript + Places enabled, referrer-restricted,
   **daily quota cap set**. Add to env and SSM.
2. Confirm `GOOGLE_PLACES_API_KEY` (server) is set — currently only the reviews plugin uses it.
3. Apply the migration.
4. **Set the true outer radius.** Seeded at 20 km; today scheduled delivery is unbounded, so anything
   beyond the outer zone starts being refused on deploy.
5. Check the shop pin in Catalogue → Delivery zones; it defaults to the previously hardcoded coords.

## Follow-ups (out of scope)

- Lift `lib/delivery/*` into `@realm/delivery` when tiffin-grab adopts it.
- Cache Places Details by `place_id`.
- Driving distance via Distance Matrix if straight-line proves misleading.
- Per-type lead times and delivery windows.
