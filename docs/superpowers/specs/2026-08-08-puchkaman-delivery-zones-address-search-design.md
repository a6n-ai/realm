# puchkaman delivery zones and Google address search

**Date:** 2026-08-08
**Status:** Approved design, not yet planned
**Scope:** `apps/puchkaman` only. No shared package, no tiffin-grab change.

## Problem

Three separate weaknesses in puchkaman's delivery flow, which turn out to be one change:

1. **A geolocation button that does nothing.** `components/order/order-direct-cta.tsx` asks for
   `navigator.geolocation`, computes a distance, renders a message, and discards the coordinates.
   Every branch links to the same `/checkout?fulfillment=delivery`. It costs a permission prompt
   and buys nothing.
2. **Free-text addresses geocoded by a keyless third party.** Checkout takes a `<textarea>`
   (`checkout-client.tsx:374`) and resolves it through OpenStreetMap Nominatim
   (`lib/delivery/geocode.ts:15`). `orders.service.ts:549-551` throws when that returns `null`, so
   **Nominatim being down or rate-limiting takes delivery checkout offline.** Nominatim's usage
   policy also discourages exactly this traffic pattern.
3. **Delivery economics hardcoded in a constants file.** `lib/delivery/distance.ts:4-6` fixes a 7 km
   radius, a 15% discount and a $35 minimum. Changing any of them is a code deploy.

## Goals

1. Replace the geolocation prompt with a Google Places address search, on both checkout and a
   public "do we deliver to you?" checker.
2. Make delivery zones admin-editable rows with a radius, a fee, a discount and a minimum,
   administered on an interactive map.
3. Remove Nominatim from the critical path without removing it as a fallback.

## Non-goals

- Lead capture for out-of-area customers. puchkaman has no inquiries model (the catering form is a
  separate concern) and is not gaining one. **Out of range is a plain refusal.**
- Driving distance. Zones are straight-line (haversine) radii, as today.
- Polygon or postal-code zones.
- Any change to tiffin-grab, whose zones are postal-prefix based and stay that way.
- Extracting a shared package. Nothing zone-related exists in `@realm/*` and the two apps' models
  differ; this stays app-local until a third consumer argues otherwise.

## Key decisions

| Decision | Choice | Why |
|---|---|---|
| Zone shape | Radius from the shop | What puchkaman already models, just hardcoded |
| Zone payload | Fee **and** discount, plus min subtotal | User requirement; discount exists today and is not being dropped |
| Out of range | Reject | No inquiries model in puchkaman |
| Maps SDK | Google (`@react-google-maps/api`) | Native editable `<Circle>`; one SDK for autocomplete + admin map |
| Key strategy | New public browser key | Autocomplete and Maps JS both run client-side; the reviews key is server-only and must not be reused |
| Distance | Haversine, straight line | Already implemented and correct for a 15 km urban radius |

### Why not a shadcn map library

`mapcn`, `shadcn-map` and Terrae are MapLibre or Leaflet based and keyless, which is attractive.
But MapLibre has no circle primitive — circles are Turf.js-generated GeoJSON polygons with
hand-rolled resize handles. Since the browser key is already required for Places Autocomplete,
adopting one would mean a second mapping stack for a worse editor. Google Maps is used for both
surfaces, with shadcn chrome around it.

---

## Data model

### New table `delivery_zones`

Additive migration. Follows tiffin-grab's catalog-resource shape so it inherits admin CRUD, soft
delete and audit stamping from `UpdatableRepository`.

```ts
export const deliveryZones = pgTable("delivery_zones", {
  ...updatableColumns("zon"),
  name: text("name").notNull(),
  radiusKm: numeric("radius_km", { precision: 6, scale: 2 }).notNull(),
  feeAmount: numeric("fee_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  discountPct: numeric("discount_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  minSubtotal: numeric("min_subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
  requiresScheduling: boolean("requires_scheduling").notNull().default(false),
  active: boolean("active").notNull().default(true),
});
```

Soft delete (`active = false`) rather than hard delete, so historical orders keep a resolvable zone.

### Store origin moves to app settings

`STORE_LAT` / `STORE_LNG` (`lib/delivery/distance.ts:2-3`) become nullable columns on the `app`
singleton, defaulting to the current constants. Every radius is measured from this point, so an
admin must be able to move it. The constants remain exported as defaults and for
`lib/seo.ts:81-82`'s LocalBusiness JSON-LD.

### Orders gain a fee column

`orders` has `discount_amount` but no delivery fee — the only current money effect of distance is a
discount. Add:

```ts
deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2 }),
deliveryZoneId: bigint("delivery_zone_id", { mode: "bigint" }).references(() => deliveryZones.id),
```

`delivery_lat` / `delivery_lng` already exist and are currently written but never read. They start
being read for the zone recheck.

### Seed — and a deliberate behaviour change

The migration seeds **one** zone:

| name | radiusKm | feeAmount | discountPct | minSubtotal | requiresScheduling |
|---|---|---|---|---|---|
| Standard | 7.00 | 0 | 15.00 | 0 | false |

**7 km is a hard delivery limit. Nothing is delivered beyond it.** The radius is per-zone, so the
outermost active zone's radius *is* the limit — adding a second, larger zone extends coverage; there
is no separate global setting.

This intentionally removes an existing capability. Today `orders.service.ts:566-574` accepts orders
*outside* 7 km when the subtotal clears $35 and a time is scheduled, with no upper bound at all.
After this change those orders are refused. That is the operator's explicit decision, not a
side effect — recorded here because it will show up as lost orders in the 7 km+ band.

Consequences:

- `SCHEDULED_DELIVERY_MIN_SUBTOTAL` (`lib/delivery/distance.ts:5`) is deleted; per-zone
  `minSubtotal` replaces it.
- The `delivery_scheduled` path is no longer reachable via the out-of-range branch. The
  `order_fulfillment` enum value stays (historical orders reference it) and remains reachable if an
  admin sets `requiresScheduling` on a zone.
- `requiresScheduling` and `minSubtotal` are retained on the zone even though the seed leaves them
  off — they are how the removed behaviour can be reinstated per zone without a migration.

### Matching

```ts
/** Smallest active zone whose radius covers the distance. null = out of range. */
export function matchZone(distanceKm: number, zones: Zone[]): Zone | null {
  return zones
    .filter((z) => z.active && distanceKm <= z.radiusKm)
    .sort((a, b) => a.radiusKm - b.radiusKm)[0] ?? null;
}
```

Pure, synchronous, no I/O — unit-testable without a database, mirroring tiffin-grab's `matchZone`
(`lib/catalog/postal.ts`).

Zone rows are read through a cached snapshot evicted on mutation, following
`lib/catalog/load.ts`'s pattern. **Write paths read the table directly inside the transaction**, not
the cache — the same discipline as `deliveries.service.ts:581`.

---

## Checkout flow

### Removed

`components/order/order-direct-cta.tsx` in full, plus its import and usage at
`app/(marketing)/order/page.tsx:4,164`. Pure UI deletion — it feeds nothing.

### The trust boundary

The browser now knows the coordinates. It must never be allowed to assert them.

```
client  →  { placeId, addressText }        ← never lat/lng, never distanceKm, never zone
server  →  Places Details (server key, place_id)
        →  lat/lng
        →  distanceFromStoreKm()
        →  matchZone()  →  fee, discount, minSubtotal, requiresScheduling
```

Distance decides a discount and a fee, both real money. A client-supplied coordinate pair would let
anyone claim an address next door to the shop. `checkout-schema.ts`'s delivery branch therefore
accepts `placeId` (optional) and `address` text, and **never** coordinates. `createCheckout`
re-resolves server-side, exactly as it re-geocodes today (`orders.service.ts:548`).

This is the existing repo rule — pricing computed server-side only, never trust client-submitted
amounts — and it is why autocomplete does not get to skip the server lookup despite already holding
the answer.

### Resolution order

1. `place_id` → Places Details (authoritative). Cacheable: `place_id` is the one Places field Google
   permits caching indefinitely.
2. No `place_id` (customer typed without picking) → Places text search.
3. Both failed → **Nominatim**, retained as fallback.

Only if all three fail does checkout refuse. Strictly more available than today, where Nominatim is
the sole path.

### Pricing order

```
subtotal
  − zone discount (discountPct × subtotal)   → Clover discount line
  + zone fee                                  → Clover fee line, NOT discountable
  + tax                                       → Clover computes, on the grouped net
```

**The fee is added after the discount and is not itself discountable.** Otherwise a coupon silently
discounts your courier cost. Both reach Clover as separate lines, which also keeps the POS receipt
readable. Per the repo's existing rule, Clover remains the authority on the final charged total.

### Gates

- `subtotal < zone.minSubtotal` → reject with the zone's minimum named.
- `zone.requiresScheduling && !scheduledFor` → reject asking for a time.
- `matchZone(...) === null` → reject: *"We don't deliver to that address yet — pickup is available
  at 3315 Danforth Ave."* No lead written.

### Address field

The `<textarea>` at `checkout-client.tsx:371-385` becomes a Places Autocomplete input, biased to the
shop's location and restricted to Canada. The existing "Check address" button and its
`addressCheck` state remain — the client still requires a successful check before submit
(`checkout-client.tsx:136`), and that check now returns zone name, fee, discount and distance so the
customer sees the cost before paying.

Styling matches the surrounding hand-rolled "brutal" design system (`className="input"`), not
shadcn — puchkaman's public site does not use `@realm/ui` chrome.

---

## Public address checker

The `/order` page loses the geolocation CTA and gains an address checker answering the same
question honestly.

Served:

```
✓ Yes — Inner zone, 2.4 km
  Free delivery · 15% off · no minimum
```

Not served:

```
✗ We don't deliver to 12 King St yet
  (9.2 km — we deliver up to 7 km)
  Pickup is available at 3315 Danforth Ave
```

The stated limit is the largest active zone's radius, read from the data — never a hardcoded string,
or it will drift the first time an admin changes a radius.

Naming the distance and the limit makes a refusal read as policy rather than a failure, and points
at pickup instead of dead-ending. Both surfaces call the same zone-aware
`/api/delivery/check-address`, which takes a `place_id` and never client coordinates.

---

## Admin zone editor

Route `/dashboard/settings/delivery-zones`. Split pane: map left, zone list right.

- **Concentric circles from the shop pin**, one per zone, each colour-matched to its list card so
  map and list read as one object.
- **Drag the edge handle to resize.** `<Circle editable onRadiusChanged>` returns metres; stored as
  km. Circle dragging is disabled — zones are concentric by definition.
- **The shop pin is draggable** and writes back to app settings.
- **Radius is also a number input**, bound to the same value. Dragging explores; typing is exact.
  Never map-only.
- **Overlap is prevented, not warned.** A zone cannot be resized smaller than the zone inside it or
  larger than the one outside, because `matchZone`'s smallest-covering rule would otherwise silently
  reorder pricing.
- Fee, discount, minimum subtotal and requires-scheduling are edited inline on the card.

### Accessibility

The map is the weak point, so it is never the only control:

- Every zone is fully editable from form fields; the map is visualisation.
- The radius input is keyboard-reachable with arrow-key stepping.
- Each circle carries an accessible name.
- A drag-only editor is unusable by keyboard — this is the `gesture-alternative` rule, and it is the
  one most often skipped on map UIs.

### Admin order detail

`/dashboard/orders/[id]` (`page.tsx:69-88`) already shows address, distance and scheduled time. It
gains zone name and delivery fee.

---

## API keys and cost

Two distinct keys. They must not be merged.

| Key | Where | Restrictions |
|---|---|---|
| `GOOGLE_PLACES_API_KEY` (exists) | Server only, reviews plugin | API restriction: Places API. No referrer restriction. |
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY` (new) | Browser: autocomplete + admin map | **HTTP referrer restricted** to puchkaman.ca and localhost; API restriction: Maps JavaScript + Places. **Daily quota cap set in Cloud Console.** |

The public key is, by design, visible in the page source. Referrer restriction plus a quota cap is
the intended protection; without the cap, a copied key can run up a bill. Google bills Dynamic Maps
per load, so the admin map is a small recurring cost — acceptable for an admin-only page, and worth
knowing before it appears on an invoice.

The server key must never be used client-side, and the public key must never be used for the reviews
Places Details call.

---

## Verification

- `matchZone` unit tests: inside smallest, between zones, exactly on a boundary, beyond all zones,
  inactive zone skipped, unsorted input.
- Pricing unit test: discount applies to subtotal, fee added after and not discounted.
- Resolution-order test: `place_id` path, text-search fallback, Nominatim fallback, all-fail refusal.
- A test asserting the checkout schema **rejects** client-supplied `lat`/`lng` — the trust boundary
  should fail loudly if someone widens it later.
- `pnpm --filter puchkaman typecheck` and the package suites.
- By eye: `"use client"` on the map and autocomplete components; the public key never imported into
  a server module.

## Operator steps

1. Create `NEXT_PUBLIC_GOOGLE_MAPS_KEY` in Google Cloud: enable Maps JavaScript API and Places API,
   restrict by HTTP referrer, set a daily quota cap. Add to puchkaman's env and SSM.
2. The seeded limit is 7 km. Orders beyond it are refused from deploy onward — previously they were
   accepted with a $35 minimum and a scheduled time. Expect lost orders in the 7 km+ band; add a
   second, larger zone in the admin if that proves too tight.
3. Apply the migration.
4. Verify the shop pin position in Settings → Delivery zones after deploy.

## Follow-ups (explicitly out of scope)

- Driving distance via Distance Matrix, if straight-line proves misleading in practice.
- Per-zone cutoff times or capacity.
- Postal-code zones alongside radii.
- Lifting zone administration into a shared package if a third client needs it.
