# puchkaman Delivery Zones and Google Address Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace puchkaman's dead geolocation prompt and free-text address with Google Places address search, and turn its hardcoded delivery radius into admin-editable zones administered on an interactive map.

**Architecture:** A new `delivery_zones` table holds one row per concentric radius from the shop, each carrying a fee, a discount, a minimum subtotal and a scheduling flag. A pure `matchZone(distanceKm, zones)` picks the smallest covering zone; `null` means out of range and the order is refused. The browser gets a referrer-restricted Google Maps key for Places Autocomplete and the admin map, but it may only ever send a `place_id` — the server re-resolves coordinates itself, because distance decides real money.

**Tech Stack:** TypeScript, Next.js 16 (App Router, RSC), React 19, Drizzle ORM + PostgreSQL, zod 4, vitest 4, `@react-google-maps/api`, Google Places API (server + browser keys), pnpm + Turborepo.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-08-puchkaman-delivery-zones-address-search-design.md`.
- **Scope is `apps/puchkaman` only.** No shared package, no tiffin-grab change.
- **puchkaman is in production with real orders.** Every migration is additive. Never rewrite an applied migration.
- **Pricing is computed server-side only. Never trust client-submitted amounts.** The checkout schema must reject client `lat`/`lng`/`distanceKm`/zone.
- **7 km is a hard delivery limit.** Beyond the largest active zone's radius, delivery is refused. This removes today's "outside 7 km with a $35 minimum and a scheduled time" path, which was unbounded.
- **Out of range is a plain refusal.** puchkaman has no inquiries model and is not gaining one. No lead capture.
- Audit fields (`created_by`/`updated_by`) are stamped from the session, never from input.
- Two distinct API keys: `GOOGLE_PLACES_API_KEY` (server, reviews plugin — do not reuse in the browser) and `NEXT_PUBLIC_GOOGLE_MAPS_KEY` (browser, referrer-restricted). The server key must never reach client code; the public key must never be used for the reviews call.
- puchkaman's public site uses its own hand-rolled "brutal" styling (`className="input"`, `className="card"`), **not** `@realm/ui` chrome. The admin dashboard does use `@realm/ui`.
- Verify contract: `pnpm --filter puchkaman typecheck` and the puchkaman test suite. **Run all commands in the foreground** — `pnpm turbo test` hangs in this repo.
- `docs/` is gitignored (`.gitignore:63`) but specs/plans are tracked; committing there needs `git add -f`.
- Commit after every task.

## File Structure

| File | Responsibility |
|---|---|
| `apps/puchkaman/db/schema/delivery-zones.ts` | `delivery_zones` table |
| `apps/puchkaman/db/schema/app.ts` (modify) | `storeLat` / `storeLng` on the tenant singleton |
| `apps/puchkaman/db/schema/orders.ts` (modify) | `delivery_fee`, `delivery_zone_id` |
| `apps/puchkaman/lib/delivery/zones.ts` | `matchZone`, `Zone` type, `deliveryLimitKm` |
| `apps/puchkaman/lib/delivery/zones.service.ts` | Zone CRUD + cached snapshot + store origin |
| `apps/puchkaman/lib/delivery/resolve-address.ts` | `place_id` → Places Details → Places text → Nominatim |
| `apps/puchkaman/lib/delivery/distance.ts` (modify) | Keep haversine + defaults; drop the pricing constants |
| `apps/puchkaman/app/api/delivery/check-address/route.ts` (modify) | Zone-aware public check |
| `apps/puchkaman/components/order/address-autocomplete.tsx` | Places Autocomplete input (brutal styling) |
| `apps/puchkaman/components/order/delivery-checker.tsx` | Public "do we deliver to you?" section |
| `apps/puchkaman/app/(dashboard)/dashboard/settings/delivery-zones/*` | Admin map + zone list + actions |

---

### Task 1: Zone matching — the pure core

**Files:**
- Create: `apps/puchkaman/lib/delivery/zones.ts`
- Test: `apps/puchkaman/lib/delivery/__tests__/zones.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Zone`, `matchZone(distanceKm, zones): Zone | null`, `deliveryLimitKm(zones): number | null`.

- [ ] **Step 1: Write the failing test**

Create `apps/puchkaman/lib/delivery/__tests__/zones.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { matchZone, deliveryLimitKm, type Zone } from "../zones";

function zone(name: string, radiusKm: number, active = true): Zone {
  return {
    name,
    radiusKm,
    feeAmount: 0,
    discountPct: 0,
    minSubtotal: 0,
    requiresScheduling: false,
    active,
  };
}

const zones = [zone("Outer", 15), zone("Inner", 7)]; // deliberately unsorted

describe("matchZone", () => {
  it("picks the smallest zone covering the distance", () => {
    expect(matchZone(2, zones)?.name).toBe("Inner");
  });

  it("falls through to a larger zone when outside the smallest", () => {
    expect(matchZone(9, zones)?.name).toBe("Outer");
  });

  it("treats a distance exactly on the boundary as inside", () => {
    expect(matchZone(7, zones)?.name).toBe("Inner");
  });

  it("returns null beyond every zone", () => {
    expect(matchZone(15.01, zones)).toBeNull();
  });

  it("skips inactive zones", () => {
    expect(matchZone(2, [zone("Inner", 7, false), zone("Outer", 15)])?.name).toBe("Outer");
  });

  it("returns null when there are no zones at all", () => {
    expect(matchZone(1, [])).toBeNull();
  });
});

describe("deliveryLimitKm", () => {
  it("is the largest active radius", () => {
    expect(deliveryLimitKm(zones)).toBe(15);
  });

  it("ignores inactive zones", () => {
    expect(deliveryLimitKm([zone("Inner", 7), zone("Outer", 15, false)])).toBe(7);
  });

  it("is null when nothing is active", () => {
    expect(deliveryLimitKm([zone("Inner", 7, false)])).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter puchkaman test -- zones`
Expected: FAIL — cannot resolve `../zones`.

- [ ] **Step 3: Implement**

Create `apps/puchkaman/lib/delivery/zones.ts`:

```ts
/**
 * A concentric delivery ring measured from the shop. Numbers are plain JS
 * numbers here — the DB stores numerics as strings, so the service layer
 * converts on read.
 */
export type Zone = {
  name: string;
  radiusKm: number;
  feeAmount: number;
  discountPct: number;
  minSubtotal: number;
  requiresScheduling: boolean;
  active: boolean;
};

/**
 * Smallest active zone whose radius covers the distance; null means out of
 * range and the order is refused. Smallest-wins is what lets a cheap inner
 * ring sit inside a more expensive outer one.
 */
export function matchZone(distanceKm: number, zones: Zone[]): Zone | null {
  return (
    zones
      .filter((z) => z.active && distanceKm <= z.radiusKm)
      .sort((a, b) => a.radiusKm - b.radiusKm)[0] ?? null
  );
}

/** The furthest we deliver — shown to customers we turn away. Null when no zone is active. */
export function deliveryLimitKm(zones: Zone[]): number | null {
  const radii = zones.filter((z) => z.active).map((z) => z.radiusKm);
  return radii.length ? Math.max(...radii) : null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter puchkaman test -- zones`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/puchkaman/lib/delivery
git commit -m "feat(puchkaman): add pure delivery-zone matching"
```

---

### Task 2: Schema, migration, and the zone service

**Files:**
- Create: `apps/puchkaman/db/schema/delivery-zones.ts`
- Modify: `apps/puchkaman/db/schema/app.ts`, `apps/puchkaman/db/schema/orders.ts`, `apps/puchkaman/db/schema/index.ts`
- Create: `apps/puchkaman/lib/delivery/zones.service.ts`
- Test: `apps/puchkaman/lib/delivery/__tests__/zones.service.test.ts`

**Interfaces:**
- Consumes: `Zone` from Task 1; `updatableColumns` from `@realm/database`.
- Produces: `deliveryZones` table; `getZones()`, `getStoreOrigin()`, `saveZone()`, `retireZone()`, `saveStoreOrigin()`.

- [ ] **Step 1: Write the schema**

Create `apps/puchkaman/db/schema/delivery-zones.ts`:

```ts
import { updatableColumns } from "@realm/database";
import { boolean, numeric, pgTable, text } from "drizzle-orm/pg-core";

/**
 * One concentric ring from the shop. The largest active radius IS the delivery
 * limit — there is no separate global setting.
 */
export const deliveryZones = pgTable("delivery_zones", {
  ...updatableColumns("zon"),
  name: text("name").notNull(),
  radiusKm: numeric("radius_km", { precision: 6, scale: 2 }).notNull(),
  feeAmount: numeric("fee_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  discountPct: numeric("discount_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  minSubtotal: numeric("min_subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
  requiresScheduling: boolean("requires_scheduling").notNull().default(false),
  // Soft delete: historical orders keep a resolvable zone.
  active: boolean("active").notNull().default(true),
});
```

Add to `apps/puchkaman/db/schema/app.ts` (the shop origin every radius is measured from):

```ts
  storeLat: numeric("store_lat", { precision: 9, scale: 6 }),
  storeLng: numeric("store_lng", { precision: 9, scale: 6 }),
```

Add to `apps/puchkaman/db/schema/orders.ts`, beside the existing delivery columns:

```ts
    deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2 }),
    deliveryZoneId: bigint("delivery_zone_id", { mode: "bigint" }).references(() => deliveryZones.id),
```

Export from `apps/puchkaman/db/schema/index.ts`:

```ts
export * from "./delivery-zones";
```

- [ ] **Step 2: Generate and inspect the migration**

Run: `pnpm --filter puchkaman db:generate`

**Read the generated SQL before applying.** Expected: `CREATE TABLE "delivery_zones"`, plus `ALTER TABLE "app" ADD COLUMN` ×2 and `ALTER TABLE "orders" ADD COLUMN` ×2. `ADD COLUMN` on an existing table is additive and expected here.

**If drizzle emits any `DROP`, or an `ALTER … ALTER COLUMN` / `SET NOT NULL` on an existing column, STOP and report BLOCKED with the SQL.** That would indicate drift between the code and the live database, which is a bigger problem than this task.

- [ ] **Step 3: Add the seed to the generated migration**

Append to the generated `.sql` file — one zone reproducing today's inner-radius behaviour:

```sql
--> statement-breakpoint
INSERT INTO "delivery_zones" ("name", "radius_km", "fee_amount", "discount_pct", "min_subtotal", "requires_scheduling")
VALUES ('Standard', 7.00, 0, 15.00, 0, false);
```

Editing a *not-yet-applied* generated migration is fine. Never edit one that has already run.

- [ ] **Step 4: Apply locally**

Run: `pnpm --filter puchkaman db:migrate`

- [ ] **Step 5: Write the failing service test**

Create `apps/puchkaman/lib/delivery/__tests__/zones.service.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { rowToZone } from "../zones.service";

describe("rowToZone", () => {
  it("converts numeric strings from the DB into numbers", () => {
    const zone = rowToZone({
      name: "Standard",
      radiusKm: "7.00",
      feeAmount: "0.00",
      discountPct: "15.00",
      minSubtotal: "0.00",
      requiresScheduling: false,
      active: true,
    });
    expect(zone).toEqual({
      name: "Standard",
      radiusKm: 7,
      feeAmount: 0,
      discountPct: 15,
      minSubtotal: 0,
      requiresScheduling: false,
      active: true,
    });
  });
});
```

The conversion is worth pinning: Drizzle returns `numeric` as a **string**, and `"7.00" <= 7` is a
string/number comparison that happens to work — until a radius of `"10.00"` compares as less than
`"7.00"` lexically somewhere. Converting once at the boundary is what keeps `matchZone` honest.

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm --filter puchkaman test -- zones.service`
Expected: FAIL — cannot resolve `../zones.service`.

- [ ] **Step 7: Implement the service**

Create `apps/puchkaman/lib/delivery/zones.service.ts`:

```ts
import { eq } from "drizzle-orm";
import { UpdatableRepository } from "@realm/database";
import { db } from "@/db/client";
import { app, deliveryZones } from "@/db/schema";
import { SessionUpdatableService } from "@/lib/services/session-service";
import { DEFAULT_STORE_LAT, DEFAULT_STORE_LNG } from "./distance";
import type { Zone } from "./zones";

type ZoneRow = {
  name: string;
  radiusKm: string;
  feeAmount: string;
  discountPct: string;
  minSubtotal: string;
  requiresScheduling: boolean;
  active: boolean;
};

/** Drizzle returns `numeric` as a string; convert once at the boundary. */
export function rowToZone(row: ZoneRow): Zone {
  return {
    name: row.name,
    radiusKm: Number(row.radiusKm),
    feeAmount: Number(row.feeAmount),
    discountPct: Number(row.discountPct),
    minSubtotal: Number(row.minSubtotal),
    requiresScheduling: row.requiresScheduling,
    active: row.active,
  };
}

class ZoneService extends SessionUpdatableService<typeof deliveryZones> {}
const zoneService = new ZoneService(
  new UpdatableRepository(db, deliveryZones, deliveryZones.publicId, deliveryZones.id),
);

export async function getZones(): Promise<Zone[]> {
  const rows = await db.select().from(deliveryZones).where(eq(deliveryZones.active, true));
  return rows.map(rowToZone);
}

export async function getStoreOrigin(): Promise<{ lat: number; lng: number }> {
  const [row] = await db.select({ lat: app.storeLat, lng: app.storeLng }).from(app).limit(1);
  return {
    lat: row?.lat != null ? Number(row.lat) : DEFAULT_STORE_LAT,
    lng: row?.lng != null ? Number(row.lng) : DEFAULT_STORE_LNG,
  };
}
```

Add `saveZone`, `retireZone` and `saveStoreOrigin` following the same `SessionUpdatableService`
pattern the app already uses in `lib/services/integrations.service.ts` — read that file first and
match it, including how it resolves the singleton `app` row.

Rename the constants in `lib/delivery/distance.ts` from `STORE_LAT`/`STORE_LNG` to
`DEFAULT_STORE_LAT`/`DEFAULT_STORE_LNG`, keeping the values, and update `lib/seo.ts:81-82`. **Delete**
`INSTANT_DELIVERY_RADIUS_KM`, `SCHEDULED_DELIVERY_MIN_SUBTOTAL` and `INSTANT_DELIVERY_DISCOUNT_PCT`
— they are replaced by zone rows. Their remaining consumers are fixed in Tasks 4 and 5; expect
typecheck errors until then and say so in your report rather than patching those files early.

- [ ] **Step 8: Run the tests**

Run: `pnpm --filter puchkaman test -- zones`
Expected: PASS (Task 1's 9 plus this 1).

- [ ] **Step 9: Commit**

```bash
git add apps/puchkaman/db apps/puchkaman/lib
git commit -m "feat(puchkaman): add delivery_zones table, store origin, and zone service"
```

---

### Task 3: Server-side address resolution

**Files:**
- Create: `apps/puchkaman/lib/delivery/resolve-address.ts`
- Test: `apps/puchkaman/lib/delivery/__tests__/resolve-address.test.ts`

**Interfaces:**
- Consumes: existing `geocodeAddress` from `lib/delivery/geocode.ts`.
- Produces: `resolveAddress({ placeId?, address }): Promise<ResolvedAddress | null>` where `ResolvedAddress = { lat: number; lng: number; formattedAddress: string }`.

**This is the trust boundary.** The browser knows the coordinates but must never assert them — distance decides a discount and a fee. This module is the only way coordinates enter the system.

- [ ] **Step 1: Write the failing test**

Create `apps/puchkaman/lib/delivery/__tests__/resolve-address.test.ts`. Stub `global.fetch`, save and restore it and `process.env.GOOGLE_PLACES_API_KEY` in `beforeEach`/`afterEach` so nothing leaks between cases:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveAddress } from "../resolve-address";

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_KEY = process.env.GOOGLE_PLACES_API_KEY;

beforeEach(() => {
  process.env.GOOGLE_PLACES_API_KEY = "test-key";
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  process.env.GOOGLE_PLACES_API_KEY = ORIGINAL_KEY;
  vi.restoreAllMocks();
});

function okJson(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

describe("resolveAddress", () => {
  it("resolves a place_id via Places Details", async () => {
    global.fetch = vi.fn(async () =>
      okJson({ location: { latitude: 43.7, longitude: -79.3 }, formattedAddress: "3315 Danforth Ave" }),
    ) as unknown as typeof fetch;

    expect(await resolveAddress({ placeId: "ChIJabc", address: "typed" })).toEqual({
      lat: 43.7,
      lng: -79.3,
      formattedAddress: "3315 Danforth Ave",
    });
  });

  it("falls back to text search when there is no place_id", async () => {
    global.fetch = vi.fn(async () =>
      okJson({ places: [{ location: { latitude: 43.6, longitude: -79.4 }, formattedAddress: "12 King St" }] }),
    ) as unknown as typeof fetch;

    expect(await resolveAddress({ address: "12 King St" })).toEqual({
      lat: 43.6,
      lng: -79.4,
      formattedAddress: "12 King St",
    });
  });

  it("falls back to Nominatim when Google fails", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false } as Response)
      .mockResolvedValueOnce(okJson([{ lat: "43.5", lon: "-79.5" }])) as unknown as typeof fetch;

    const out = await resolveAddress({ address: "somewhere" });
    expect(out?.lat).toBeCloseTo(43.5);
    expect(out?.lng).toBeCloseTo(-79.5);
  });

  it("returns null when every source fails", async () => {
    global.fetch = vi.fn(async () => ({ ok: false }) as Response) as unknown as typeof fetch;
    expect(await resolveAddress({ address: "nowhere" })).toBeNull();
  });

  it("returns null when the API key is missing and Nominatim also fails", async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    global.fetch = vi.fn(async () => ({ ok: false }) as Response) as unknown as typeof fetch;
    expect(await resolveAddress({ placeId: "ChIJabc", address: "x" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter puchkaman test -- resolve-address`
Expected: FAIL — cannot resolve `../resolve-address`.

- [ ] **Step 3: Implement**

Create `apps/puchkaman/lib/delivery/resolve-address.ts`. Use the **server** key
(`GOOGLE_PLACES_API_KEY`) — never `NEXT_PUBLIC_GOOGLE_MAPS_KEY`. Places API v1 endpoints:
`https://places.googleapis.com/v1/places/{placeId}` with a `location,formattedAddress` field mask,
and `POST https://places.googleapis.com/v1/places:searchText`. Match the existing style in
`packages/google-reviews/src/places-provider.ts` — read it first.

Order: `place_id` → text search → `geocodeAddress` (Nominatim, existing) → `null`. Never throw;
every failure path returns `null` and the caller decides.

Add a `// ponytail:` comment noting the Places Details response is uncached, and that caching by
`place_id` is the upgrade if request volume matters.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter puchkaman test -- resolve-address`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/puchkaman/lib/delivery
git commit -m "feat(puchkaman): resolve addresses via Places with a Nominatim fallback"
```

---

### Task 4: Checkout pricing on zones

**Files:**
- Modify: `apps/puchkaman/lib/orders/checkout-schema.ts`
- Modify: `apps/puchkaman/lib/services/orders.service.ts` (the delivery branch, ~lines 546-580 and the insert ~665-669)
- Test: `apps/puchkaman/lib/orders/__tests__/orders-checkout-schema.test.ts` (extend)
- Test: `apps/puchkaman/lib/delivery/__tests__/zone-pricing.test.ts`

**Interfaces:**
- Consumes: `matchZone`, `deliveryLimitKm` (Task 1); `getZones`, `getStoreOrigin` (Task 2); `resolveAddress` (Task 3).
- Produces: `applyZonePricing({ subtotal, zone })` → `{ discountAmount, feeAmount }`.

- [ ] **Step 1: Write the failing tests**

Add to `orders-checkout-schema.test.ts` — the trust boundary, asserted:

```ts
it("accepts a placeId on the delivery branch", () => {
  const parsed = checkoutSchema.safeParse({
    items: [{ productId: "p1", quantity: 1 }],
    contact: { name: "A", email: "a@b.c", phone: "+15551234567" },
    fulfillment: { type: "delivery", address: "3315 Danforth Ave", placeId: "ChIJabc" },
  });
  expect(parsed.success).toBe(true);
});

it("REJECTS client-supplied coordinates — distance decides money", () => {
  const parsed = checkoutSchema.safeParse({
    items: [{ productId: "p1", quantity: 1 }],
    contact: { name: "A", email: "a@b.c", phone: "+15551234567" },
    fulfillment: { type: "delivery", address: "x", lat: 43.69, lng: -79.28 },
  });
  expect(parsed.success).toBe(false);
});
```

That second test looks redundant today. It is the guard against the future "optimisation" of
trusting the coordinates autocomplete already has — which would hand anyone a 15% discount by
posting a location next to the shop. Use `.strict()` on the delivery branch so unknown keys fail.

Create `apps/puchkaman/lib/delivery/__tests__/zone-pricing.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { applyZonePricing } from "../zone-pricing";
import type { Zone } from "../zones";

const zone = (over: Partial<Zone> = {}): Zone => ({
  name: "Z", radiusKm: 7, feeAmount: 0, discountPct: 0,
  minSubtotal: 0, requiresScheduling: false, active: true, ...over,
});

describe("applyZonePricing", () => {
  it("discounts the subtotal by the zone percentage", () => {
    expect(applyZonePricing({ subtotal: 100, zone: zone({ discountPct: 15 }) }))
      .toEqual({ discountAmount: 15, feeAmount: 0 });
  });

  it("adds the fee without discounting it", () => {
    expect(applyZonePricing({ subtotal: 100, zone: zone({ discountPct: 15, feeAmount: 5 }) }))
      .toEqual({ discountAmount: 15, feeAmount: 5 });
  });

  it("rounds money to two decimals", () => {
    expect(applyZonePricing({ subtotal: 33.33, zone: zone({ discountPct: 15 }) }).discountAmount)
      .toBe(5);
  });
});
```

The middle test is the one that matters: the discount is 15 (15% of 100), **not** 15.75 (15% of 105).
The fee must never be inside the discount base, or a coupon quietly discounts your courier cost.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter puchkaman test -- zone-pricing checkout-schema`
Expected: FAIL.

- [ ] **Step 3: Implement `applyZonePricing`**

Create `apps/puchkaman/lib/delivery/zone-pricing.ts`:

```ts
import type { Zone } from "./zones";

const money = (n: number): number => Math.round(n * 100) / 100;

/**
 * Discount applies to subtotal; fee is added afterwards and is NOT discountable
 * — otherwise a percentage discount silently eats the courier cost too.
 */
export function applyZonePricing(input: { subtotal: number; zone: Zone }): {
  discountAmount: number;
  feeAmount: number;
} {
  return {
    discountAmount: money(input.subtotal * (input.zone.discountPct / 100)),
    feeAmount: money(input.zone.feeAmount),
  };
}
```

- [ ] **Step 4: Rewrite the delivery branch in `orders.service.ts`**

Replace the block at ~546-580. Read the surrounding function first; keep every existing variable
name it feeds (`deliveryAddress`, `deliveryLat`, `deliveryLng`, `deliveryDistanceKm`, `fulfillment`,
`discountAmount`, `cloverDiscounts`).

```ts
if (parsed.fulfillment.type === "delivery") {
  const [zones, origin] = await Promise.all([getZones(), getStoreOrigin()]);
  const resolved = await resolveAddress({
    placeId: parsed.fulfillment.placeId,
    address: parsed.fulfillment.address,
  });
  if (!resolved) {
    throw new ValidationError("Couldn't find that delivery address — try adding city and postal code.");
  }

  deliveryAddress = resolved.formattedAddress;
  deliveryLat = resolved.lat;
  deliveryLng = resolved.lng;
  deliveryDistanceKm = Number(haversineKm(origin.lat, origin.lng, resolved.lat, resolved.lng).toFixed(2));

  const zone = matchZone(deliveryDistanceKm, zones);
  if (!zone) {
    const limit = deliveryLimitKm(zones);
    throw new ValidationError(
      limit == null
        ? "Delivery is unavailable right now — pickup is available."
        : `We don't deliver that far yet (${deliveryDistanceKm} km — we deliver up to ${limit} km). Pickup is available.`,
    );
  }

  if (subtotal < zone.minSubtotal) {
    throw new ValidationError(`Orders over $${zone.minSubtotal} required for delivery to that address.`);
  }
  if (zone.requiresScheduling && !parsed.fulfillment.scheduledFor) {
    throw new ValidationError("Pick a delivery time for that address.");
  }

  fulfillment = zone.requiresScheduling ? "delivery_scheduled" : "delivery_instant";

  const { discountAmount: zoneOff, feeAmount } = applyZonePricing({ subtotal, zone });
  if (zoneOff > 0) {
    cloverDiscounts.push({ name: `${zone.name} delivery discount`, amount: zoneOff });
    discountAmount = Number(money(discountAmount + zoneOff));
  }
  deliveryFee = feeAmount;
  deliveryZoneId = zone.id;
}
```

When `deliveryFee > 0`, add it to the Clover order as a **separate line item**, not folded into the
subtotal — read how `atomicInput` is built around line 601 and follow that shape. Clover remains the
authority on the charged total.

Persist `deliveryFee` and `deliveryZoneId` alongside the existing delivery columns at ~665-669.

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter puchkaman test`
Expected: PASS.

- [ ] **Step 6: Verify**

Run: `pnpm --filter puchkaman typecheck`
Expected: clean — this task fixes the errors Task 2 introduced by deleting the old constants.

- [ ] **Step 7: Commit**

```bash
git add apps/puchkaman
git commit -m "feat(puchkaman): price delivery from zones, refuse beyond the limit"
```

---

### Task 5: Zone-aware address check API and the public checker

**Files:**
- Modify: `apps/puchkaman/app/api/delivery/check-address/route.ts`
- Create: `apps/puchkaman/components/order/address-autocomplete.tsx`
- Create: `apps/puchkaman/components/order/delivery-checker.tsx`
- Delete: `apps/puchkaman/components/order/order-direct-cta.tsx`
- Modify: `apps/puchkaman/app/(marketing)/order/page.tsx`

**Interfaces:**
- Consumes: `resolveAddress`, `matchZone`, `deliveryLimitKm`, `getZones`, `getStoreOrigin`.
- Produces: `POST /api/delivery/check-address` → `{ eligible, distanceKm, zone?, limitKm?, reason? }`; `<AddressAutocomplete>`; `<DeliveryChecker>`.

- [ ] **Step 1: Rewrite the check-address route**

Read the current file first. Keep it public and advisory, keep the `handler`/`json`/`problem`
helpers, and keep the comment explaining that `createCheckout` re-derives everything. Accept
`{ address, placeId? }`; **never accept coordinates**. Respond:

```ts
// served
{ eligible: true, distanceKm: 2.4, zone: { name: "Standard", feeAmount: 0, discountPct: 15, minSubtotal: 0, requiresScheduling: false } }
// out of range
{ eligible: false, distanceKm: 9.2, limitKm: 7, reason: "out-of-range" }
// unresolvable
{ eligible: false, reason: "not-found" }
```

`limitKm` comes from `deliveryLimitKm(zones)` — never a hardcoded string, or the customer-facing
message drifts the first time an admin edits a radius.

- [ ] **Step 2: Build the autocomplete input**

Create `apps/puchkaman/components/order/address-autocomplete.tsx`, a client component. Load the
Places library with `NEXT_PUBLIC_GOOGLE_MAPS_KEY`, bias to the shop origin, restrict to Canada.
Props: `value`, `onChange(address)`, `onPick({ address, placeId })`, plus `id`/`className` so the
caller controls styling.

**Style with puchkaman's brutal classes** (`className="input"`), not `@realm/ui` — this is the
public site. Match the existing field at `checkout-client.tsx:374`.

The customer must be able to submit a typed address without picking a suggestion: `placeId` is
optional everywhere, and Task 3's text-search fallback covers it.

- [ ] **Step 3: Build the public checker and delete the geolocation CTA**

Create `apps/puchkaman/components/order/delivery-checker.tsx` — an `<AddressAutocomplete>` plus a
Check button that calls the route and renders one of three states:

- served: `✓ Yes — {zone.name}, {distanceKm} km` with the fee/discount/minimum spelled out
- out of range: `✗ We don't deliver to {address} yet ({distanceKm} km — we deliver up to {limitKm} km)` plus the pickup address
- not found: ask for city and postal code

Delete `components/order/order-direct-cta.tsx` and replace its usage in
`app/(marketing)/order/page.tsx` (import line 4, render line 164) with `<DeliveryChecker />`.

Run `rg -n "order-direct-cta|navigator.geolocation" apps/puchkaman` afterwards; expect no matches.

- [ ] **Step 4: Swap the checkout address field**

In `checkout-client.tsx`, replace the `<textarea>` at 371-385 with `<AddressAutocomplete>`, keeping
the label, the error slot and the existing `addressCheck` flow. Store `placeId` in state beside
`address` and include it in the `/api/checkout` body's fulfillment object. Show the zone's fee and
discount in the check result so the customer sees the cost before paying.

- [ ] **Step 5: Verify by eye (tsc cannot catch these)**

1. `address-autocomplete.tsx` and `delivery-checker.tsx` both start with `"use client";`.
2. `NEXT_PUBLIC_GOOGLE_MAPS_KEY` appears **only** in client components; `GOOGLE_PLACES_API_KEY`
   appears **only** in server modules. Run `rg -n "GOOGLE_PLACES_API_KEY" apps/puchkaman/components`
   — expect no matches.

- [ ] **Step 6: Verify**

Run: `pnpm --filter puchkaman typecheck && pnpm --filter puchkaman test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A apps/puchkaman
git commit -m "feat(puchkaman): Google address search on checkout and a public delivery checker"
```

---

### Task 6: Admin zone editor with an interactive map

**Files:**
- Create: `apps/puchkaman/app/(dashboard)/dashboard/settings/delivery-zones/page.tsx`
- Create: `.../delivery-zones/actions.ts`
- Create: `.../delivery-zones/zone-editor.tsx`
- Create: `.../delivery-zones/zone-map.tsx`
- Modify: `apps/puchkaman/app/(dashboard)/dashboard/settings/page.tsx`
- Modify: `apps/puchkaman/app/(dashboard)/dashboard/orders/[id]/page.tsx`
- Modify: `apps/puchkaman/package.json` (add `@react-google-maps/api`)

**Interfaces:**
- Consumes: `getZones`, `saveZone`, `retireZone`, `getStoreOrigin`, `saveStoreOrigin`.
- Produces: `/dashboard/settings/delivery-zones`; `saveZoneAction`, `retireZoneAction`, `saveStoreOriginAction`.

- [ ] **Step 1: Add the dependency**

Add `"@react-google-maps/api": "^2.20.3"` to `apps/puchkaman/package.json`, then `pnpm install` from
the repo root. Verify the installed version resolves; if it does not, report the version you used.

- [ ] **Step 2: Write the server actions**

Create `.../delivery-zones/actions.ts`. Every action: `"use server"`, `requireAdmin()` first,
`recordAudit` after a successful write, `revalidatePath`. **Return `{ error?: string }`; never
throw** — a thrown Server Action error reaches the client as an opaque digest.

Validate with zod before writing: `radiusKm > 0`, `discountPct` 0–100, `feeAmount >= 0`,
`minSubtotal >= 0`, `name` non-empty.

**Enforce non-overlap server-side**, not only in the UI: a saved radius must not equal another active
zone's radius, or `matchZone`'s smallest-covering rule becomes ambiguous. Return a clear error.

- [ ] **Step 3: Build the map**

Create `.../delivery-zones/zone-map.tsx`, a client component:

```tsx
<GoogleMap center={origin} zoom={11}>
  <Marker position={origin} draggable onDragEnd={(e) => onOriginChange(e.latLng)} />
  {zones.map((z) => (
    <Circle
      key={z.publicId}
      center={origin}
      radius={z.radiusKm * 1000}   // Google works in metres, we store km
      editable
      draggable={false}            // concentric by definition — only the pin moves
      options={{ fillColor: z.color, fillOpacity: 0.15, strokeColor: z.color, strokeWeight: 2 }}
      onRadiusChanged={/* read radius off the circle ref, convert to km, clamp, commit */}
    />
  ))}
</GoogleMap>
```

`onRadiusChanged` fires with no argument — you must hold a ref per circle and call `getRadius()`.
Clamp the new radius between the next-smaller and next-larger active zone before committing, so a
drag cannot reorder the rings.

- [ ] **Step 4: Build the editor shell**

Create `.../delivery-zones/zone-editor.tsx`: split pane, map left, zone cards right, using
`@realm/ui` (this is the dashboard, not the public site). Each card carries name, radius, fee,
discount %, minimum subtotal, requires-scheduling and a retire action, colour-matched to its circle.

**Every value must be editable from the form, not only the map.** The radius is a number input with
arrow-key stepping; the map is visualisation. A drag-only editor is unusable by keyboard.

Add a `/dashboard/settings/delivery-zones` card to the settings hub
(`settings/page.tsx`), matching the existing section style.

- [ ] **Step 5: Show zone and fee on the order detail**

`dashboard/orders/[id]/page.tsx:69-88` already renders address, distance and scheduled time. Add the
zone name and the delivery fee beside them.

- [ ] **Step 6: Verify by eye**

1. `zone-map.tsx` and `zone-editor.tsx` start with `"use client";`.
2. The page passes plain JSON to them — no functions, no Drizzle rows.
3. `@react-google-maps/api` is client-only; it must not be imported by `page.tsx`.

- [ ] **Step 7: Verify**

Run: `pnpm --filter puchkaman typecheck && pnpm --filter puchkaman test`
Expected: PASS.

Manual check with `NEXT_PUBLIC_GOOGLE_MAPS_KEY` set: create a second zone, drag its edge, confirm
the radius input tracks the drag and that it cannot be dragged inside the smaller zone; move the shop
pin and confirm the circles follow; retire a zone and confirm it disappears from the public checker.

- [ ] **Step 8: Commit**

```bash
git add -A apps/puchkaman pnpm-lock.yaml
git commit -m "feat(puchkaman): admin delivery-zone editor with an interactive map"
```

---

## Post-plan: operator steps

1. **Create `NEXT_PUBLIC_GOOGLE_MAPS_KEY`** in Google Cloud — enable Maps JavaScript API and Places
   API, restrict by HTTP referrer to `puchkaman.ca` and `localhost`, and **set a daily quota cap**.
   The key is public by design; the cap is what stops a copied key running up a bill. Add to
   puchkaman's env and SSM.
2. **Confirm `GOOGLE_PLACES_API_KEY` (server) is set** — Task 3's resolution path needs it, and it is
   currently only used by the reviews plugin.
3. **Apply the migration.**
4. **7 km becomes a hard limit on deploy.** Orders beyond it are refused; today they are accepted with
   a $35 minimum and a scheduled time. Watch for lost orders in that band and add a second zone in
   the admin if it proves too tight.
5. **Check the shop pin** in Settings → Delivery zones after deploy; it defaults to the previously
   hardcoded coordinates.

## Follow-ups (out of scope)

- Cache Places Details responses by `place_id`.
- Driving distance via Distance Matrix if straight-line proves misleading.
- Per-zone cutoff times or capacity.
- Lifting zone administration into a shared package if a third client needs it.
