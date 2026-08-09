# `@realm/places` — address search and geocoding on Amazon Location

**Date:** 2026-08-09
**Status:** Approved design, not yet planned
**Scope:** New `packages/places`, `apps/puchkaman` wiring. Phase 2 touches the zone admin map.

## Problem

The delivery feature that just shipped resolves addresses through Google Places and renders the admin
zone map with the Google Maps JS SDK. Three costs come with that:

1. **Storing coordinates is not permitted.** `orders.delivery_lat` / `delivery_lng` persist geocoded
   results indefinitely. Google's terms allow ~30 days of caching and forbid permanent storage
   outside their ecosystem. We are doing it anyway.
2. **A public browser key.** `NEXT_PUBLIC_GOOGLE_MAPS_KEY` ships in page source, needs referrer
   restriction plus a daily quota cap, and is one copy-paste away from someone else's bill.
3. **Price.** Roughly 5× the AWS equivalent for the same traffic (figures below).

The organisation already runs on AWS — SES, S3, EC2, RDS — so this is also one fewer vendor,
IAM instead of a key, and one bill.

## Verified pricing — us-east-1, from the public bulk pricing file

`https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonLocationService/current/us-east-1/index.json`

| Bucket | Operation | Price | Storable |
|---|---|---|---|
| **Label** | Autocomplete, Suggest | **$0.20** / 1,000 | ❌ |
| **Core** | Autocomplete, Geocode, SearchText, GetPlace | **$0.50** / 1,000 | ❌ |
| **Advanced** | + hours, contacts, timezone | $1.50 / 1,000 | ❌ |
| **Stored** | any of the above with `IntendedUse = "Storage"` | **$4.00** / 1,000 | ✅ indefinitely |
| Maps | map tile | **$0.04** / 1,000 tiles | — |

Google, for comparison: Autocomplete ~$2.83/1k, Geocoding $5.00/1k, Dynamic Maps $7.00/1k *loads*,
and permanent storage of geocoding results not permitted at any price.

**Modelled at 1,000 delivery orders/month:** ~8,000 Label autocompletes ($1.60) + 1,000 Stored
geocodes ($4.00) + ~2,000 Core checker geocodes ($1.00) + map tiles (~$0.01) ≈ **$6.60/month**,
against roughly $38 on Google.

### The call-site split is the whole saving

Label and Stored differ by **20×**. The design depends on putting each call in the right bucket:

- **Autocomplete fires per keystroke** and only needs a PlaceID and a display string → **Label**.
- **Checkout resolves once per order** and its result is persisted → **Stored**.
- **The public checker resolves but persists nothing** → **Core**.

Inverting this — Stored on every keystroke — makes AWS *more expensive* than Google. The saving is
in the architecture, not the vendor.

## Goals

1. A `@realm/places` package with a `PlaceProvider` interface and an Amazon Location implementation.
2. Google retained behind the same interface — as fallback, and to A/B address quality.
3. **No vendor key in the browser.** Autocomplete proxies through our own rate-limited route,
   IAM-signed server-side.
4. Phase 2: the admin zone map on MapLibre + Amazon Location tiles.

## Non-goals

- Changing zone/type semantics, pricing, or the checkout contract. This swaps the address provider
  and nothing else.
- Removing Nominatim. It stays as the last-resort fallback it already is.
- Any tiffin-grab change. The package is written to be liftable, not lifted.
- Routing/Distance Matrix. Distance stays straight-line haversine.

## Key decisions

| Decision | Choice | Why |
|---|---|---|
| Package name | `@realm/places` | Domain, not vendor — the provider is swappable |
| Suggest bucket | `Label` | 20× cheaper than Stored; a dropdown needs only id + text |
| Checkout bucket | `Stored` | The one call whose result we persist; the only legal way to keep it |
| Checker bucket | `Core` | Resolves but persists nothing |
| Browser key | **none** | Autocomplete proxies server-side through the existing throttled route |
| Credentials | Default provider chain | Matches `SESv2Client` in `@realm/email` — instance role in prod, profile locally |
| Google | Kept behind the interface | Fallback + address-quality comparison, not deleted |

---

## Package shape

```
packages/places/
  package.json          @aws-sdk/client-geo-places, zod; peer react for ./ui
  src/types.ts          PlaceProvider, PlaceSuggestion, ResolvedPlace
  src/aws-provider.ts   Amazon Location — Label suggest, Core/Stored resolve
  src/google-provider.ts  the existing Places logic, moved
  src/nominatim.ts      existing keyless fallback, moved
  src/resolve.ts        provider selection + fallback chain
  src/index.ts          server barrel
  src/ui/index.ts       headless autocomplete hook — calls the app's own route
```

Nothing puchkaman-specific in names or types, so it can lift into a shared consumer later without a
rename. The package never imports an app; the app injects its provider choice and its route path.

### The interface

```ts
export type PlaceSuggestion = {
  placeId: string;
  /** Display string for the dropdown. Label bucket returns exactly this. */
  label: string;
};

export type ResolvedPlace = {
  lat: number;
  lng: number;
  formattedAddress: string;
};

export type PlaceProvider = {
  id: "aws" | "google" | "nominatim";
  /** Typeahead. Cheap bucket — id + text only, never persisted. */
  suggest(query: string, opts: { near?: { lat: number; lng: number }; country?: string }): Promise<PlaceSuggestion[]>;
  /**
   * Resolve to coordinates. `persist: true` selects the storage-licensed bucket
   * (AWS `IntendedUse = "Storage"`) and costs ~8× more — set it only when the
   * result is written to the database.
   */
  resolve(input: { placeId?: string; address: string; persist: boolean }): Promise<ResolvedPlace | null>;
};
```

`persist` is a required parameter, not an option with a default. A caller must state whether the
result is being kept — that is the decision that costs money, and it should be impossible to make
accidentally.

### Fallback chain

`resolve()` keeps the behaviour the current code already has, with the provider swapped:

1. Primary provider (AWS), `placeId` path
2. Primary provider, text search
3. Google, if configured
4. Nominatim
5. `null`

**Never throws.** A thrown error here takes delivery checkout offline, which is the failure the
current design already removed. Every layer returns `null` and the caller decides.

---

## Phase 1 — server-side, no browser key

### Autocomplete proxy

New route in puchkaman, or an extension of the existing check-address route:

```
POST /api/delivery/suggest   { query }  →  { suggestions: PlaceSuggestion[] }
```

- Reuses the **existing per-IP throttle** (`lib/http/rate-limit.ts`) — this endpoint is exactly the
  kind of per-keystroke traffic it was built for. Consider a tighter limit than the address check.
- Debounced client-side (~250ms) so a typed address is a handful of calls, not one per character.
- IAM-signed server-side. **No `NEXT_PUBLIC_*` key exists after this phase.**

### The autocomplete component loses its vendor

`components/order/address-autocomplete.tsx` currently loads the Google Places JS widget. It becomes a
plain input plus a suggestions dropdown fed by the route above. Consequences, all improvements:

- The hand-rolled `google.maps` types disappear.
- No third-party script on the public site — one less thing to load, and one less origin in the CSP.
- Styling stays puchkaman's brutal system, and now genuinely ours to control.

### Checkout and checker call sites

- `orders.service.ts` → `resolve({ placeId, address, persist: true })` — the Stored bucket, once per
  order, because `delivery_lat`/`delivery_lng` are written.
- `check-address` route → `resolve({ ..., persist: false })` — Core, nothing kept.

`resolveAddress` in `lib/delivery/resolve-address.ts` becomes a thin binding to the package,
preserving its existing signature so neither call site changes shape.

### Address-quality gate before cutover

AWS uses Esri/HERE data. We recently fixed apartment numbers being silently dropped, so provider
accuracy is not a detail here.

**Before AWS becomes the default**, run a fixture of real Scarborough addresses — including unit and
apartment numbers — through both providers and compare `formattedAddress` and coordinates. Keep the
fixture as a test. If AWS is materially worse on Canadian subpremise data, the provider interface
means we ship the package and leave Google as primary, which is still a win: the browser key is gone
either way.

---

## Phase 2 — the admin map on MapLibre

**Separable, and deferrable.** Phase 1 delivers the cost and licensing win; this phase removes the
last Google dependency.

Amazon Location serves map tiles consumed by MapLibre GL JS. The problem: **MapLibre has no circle
primitive.** Google's `<Circle editable onRadiusChanged>` — which is why Google was chosen for the
admin map originally — has no direct equivalent. A radius circle becomes a Turf.js-generated polygon
with hand-rolled drag handles.

Two routes, evaluate in this order:

1. **[`maplibre-gl-geo-editor`](https://github.com/opengeos/maplibre-gl-geo-editor)** — extends Geoman,
   supports circle drawing and editing. If it handles a fixed-centre, radius-only circle cleanly, use
   it.
2. **Turf.js + custom handles** — `turf.circle(center, radius)` re-rendered as a GeoJSON source on
   drag, with a draggable marker on the ring. More code, full control.

Either way the existing invariants hold and are **not** negotiable:

- The **radius number input remains the source of truth**; the map is visualisation. This is already
  the design and the accessibility requirement — a drag-only editor is unusable by keyboard.
- The **server-side clamp stays authoritative** (`catalogue/delivery-zones/actions.ts`). Whatever the
  map sends, the server re-derives the neighbours' radii and clamps. Nothing about the map change
  touches that.

**Ship-blocking condition:** if neither route produces a circle editor as good as the current one,
Phase 2 stops and the admin map stays on Google. The admin map is one internal screen; the public
site and the cost model are already fixed by Phase 1.

---

## Configuration

| Setting | Where | Notes |
|---|---|---|
| `AWS_REGION` | server env | Already set for SES/S3 |
| Credentials | default provider chain | Instance role in prod; `realm-admin` profile locally. Matches `SESv2Client`. |
| `PLACES_PROVIDER` | server env | `aws` \| `google` — lets the operator flip without a deploy |
| `GOOGLE_PLACES_API_KEY` | server env | Retained for the fallback provider and the reviews plugin |
| ~~`NEXT_PUBLIC_GOOGLE_MAPS_KEY`~~ | **removed in Phase 1** | No browser key after the proxy lands |

IAM policy for the app role — least privilege, no wildcards:

```
geo-places:Autocomplete
geo-places:Suggest
geo-places:Geocode
geo-places:GetPlace
geo-maps:GetTile          (Phase 2 only)
```

## Verification

- `PlaceProvider` conformance tests run against **both** implementations from one shared suite —
  the interface only earns its keep if both sides genuinely satisfy it.
- Bucket selection pinned: `persist: true` must produce `IntendedUse = "Storage"`, `persist: false` must
  not. Assert on the request the SDK is handed, stubbed — this is the cost control, and a silent
  regression here is a 20× bill increase with no functional symptom.
- Fallback chain: primary fails → Google → Nominatim → `null`; never throws.
- Canadian address fixture comparing providers on unit/apartment handling.
- The suggest route is throttled and returns `{ suggestions: [] }` rather than an error on no match.
- By eye: no `NEXT_PUBLIC_GOOGLE_MAPS_KEY` reference survives Phase 1; no AWS credential reaches a
  client component.

## Operator steps

1. Attach the IAM actions above to the app's role.
2. Set `PLACES_PROVIDER=aws` after the address-quality comparison passes.
3. Remove `NEXT_PUBLIC_GOOGLE_MAPS_KEY` from env and SSM once Phase 1 is deployed — and revoke the
   key in Google Cloud, since it was public.
4. Watch the first month's Location bill against the model above. A figure materially over ~$7 at
   ~1,000 orders means a call landed in the wrong bucket.

## Amendment, 2026-08-09 — the Stored bucket is gone

Everything above describes the design as approved. Two things changed during
implementation; the text above is left as written, this section is what shipped.

**`orders.delivery_lat` / `delivery_lng` were dropped** (migration `0007`). The
whole-branch review found them to be write-only — nothing in the codebase ever
read them. They were the sole reason checkout needed the storage-licensed bucket,
so the design's central cost split no longer applies:

| Call site | As designed | As shipped |
|---|---|---|
| Autocomplete | Label, $0.20/1k | unchanged |
| Checkout resolve | **Stored, $4.00/1k** | **Core, $0.50/1k** |
| Public checker | Core, $0.50/1k | unchanged |

Modelled at 1,000 delivery orders/month: ~8,000 Label ($1.60) + ~3,000 Core
($1.50) ≈ **$3.10/month**, against the $6.60 projected above.

Checkout still geocodes. The coordinates derive `delivery_distance_km` — which is
read, by zone matching and the admin UI — and are then discarded. A derived
distance is not geocoder output, so no storage licence attaches to it.

Consequences worth knowing before anyone reverses this:

- `resolveAddressForStorage` and its separate AWS+Nominatim chain are deleted.
  Persisting a coordinate again means restoring both, and Google can never be in
  that chain at any price.
- `persist` remains in the `PlaceProvider` interface. It is the package's
  contract and tiffin-grab may need it; no puchkaman caller sets it true, and a
  test asserts every provider in the chain receives `persist: false`.
- The "cache placeId → ResolvedPlace" follow-up below is now a latency
  optimisation, not a cost one — repeat resolves are Core, not Stored.

**`geo-places:Suggest` was not granted.** The IAM list above names four actions;
`aws-provider.ts` only ever issues `Autocomplete`, `Geocode`, and `GetPlace`. The
policy grants those three.

## Follow-ups

- Cache `placeId → ResolvedPlace` — `placeId` is stable and cacheable, and would cut repeat Stored
  calls for customers who reorder.
- Lift `@realm/places` into tiffin-grab if it ever wants geocoding.
- Amazon Location Routes for driving distance, if straight-line proves misleading.
