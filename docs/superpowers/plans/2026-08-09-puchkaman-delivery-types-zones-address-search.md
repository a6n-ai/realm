# puchkaman Delivery Types, Zones and Address Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make puchkaman's delivery rules data — delivery types with their own rules, radius zones offering one or more types — and switch checkout to address-first Google Places search that offers the customer the types actually available at their distance.

**Architecture:** `delivery_types` holds the rules (minimum, discount, needs-address, needs-schedule). `delivery_zones` holds geography (a radius). A join table says which types a zone offers. A pure `availableTypes(distanceKm, zones)` returns what a customer may choose; the server re-verifies the chosen type key and re-reads its rules from the database, because the client may never state distance, coordinates or a discount.

**Tech Stack:** TypeScript, Next.js 16 (App Router, RSC), React 19, Drizzle ORM + PostgreSQL, zod 4, vitest 4, `@react-google-maps/api`, Google Places (server + browser keys), pnpm + Turborepo.

## Prior work already on the branch — reuse it, do not rebuild

This plan supersedes `2026-08-08-puchkaman-delivery-zones-address-search.md`, of which three tasks landed and remain valid:

- **`a546596`** — `apps/puchkaman/lib/delivery/zones.ts`: `matchZone`, `deliveryLimitKm`, `Zone`. **Task 1 below extends this file**; `deliveryLimitKm` survives unchanged.
- **`2318615`** — `delivery_zones` table (single-zone model), `store_lat`/`store_lng` on `app`, `lib/delivery/zones.service.ts`, migration `0006_clear_redwing.sql`. **Task 2 below reshapes the schema**; the service patterns and the seed-INSERT lesson carry over.
- **`43f7249`** — `apps/puchkaman/lib/delivery/resolve-address.ts`. **Untouched by this plan and fully reusable.**

`3d8c442` (zone pricing in `orders.service.ts`) is **superseded** — Task 4 rewrites that branch for the type model.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-09-puchkaman-delivery-types-zones-address-search-design.md`.
- **Scope is `apps/puchkaman` only.** No shared package, no tiffin-grab change. Table and column names must carry nothing puchkaman-specific, so `lib/delivery/*` can lift into `@realm/delivery` later.
- **puchkaman is in production with real orders.** Migrations additive. Never rewrite a migration that has shipped. Migration `0006_clear_redwing.sql` has only ever run on a dev machine and on this unmerged branch — it may be regenerated via `drizzle-kit drop`, but say so explicitly in your report when you do.
- **Pricing is computed server-side only. Never trust client-submitted amounts.** The checkout schema must reject client `lat`/`lng`/`distanceKm`/`discountPct`.
- **There is no delivery fee.** Clover line items need a real catalogue `itemId`; a fee could be stored but never charged, silently underbilling. No fee column anywhere.
- Drizzle returns `numeric` as a **string**. Convert once at the service boundary or radii compare lexically.
- A seed `INSERT` in a migration must supply `public_id`, `created_at` and `updated_at` explicitly — `$defaultFn` fires only through the JS driver, never raw SQL, and all three are NOT NULL with no database default.
- Audit fields stamped from the session, never from input.
- Server Actions **return** errors, never throw.
- Soft delete only (`active = false`). The hard `delete()` inherited from `UpdatableService` must never be wired to a button — order FKs are `ON DELETE no action`.
- Two keys: `GOOGLE_PLACES_API_KEY` (server) and `NEXT_PUBLIC_GOOGLE_MAPS_KEY` (browser, referrer-restricted). Neither may cross into the other's context.
- puchkaman's **public** site uses hand-rolled "brutal" styling (`className="input"`); the **dashboard** uses `@realm/ui`.
- **Run every command in the FOREGROUND.** `pnpm turbo test` hangs in this repo; use `pnpm --filter puchkaman ...`.
- `docs/` is gitignored; committing specs/plans needs `git add -f`.
- Commit after every task.

## File Structure

| File | Responsibility |
|---|---|
| `lib/delivery/zones.ts` (modify) | `Zone`, `DeliveryType`, `ZoneWithTypes`, `availableTypes`, `zoneForType`, `deliveryLimitKm` |
| `db/schema/delivery-types.ts` | `delivery_types` |
| `db/schema/delivery-zones.ts` (modify) | `delivery_zones` (geography only), `delivery_zone_types` join |
| `db/schema/orders.ts` (modify) | `delivery_type_id`, `delivery_zone_id` |
| `lib/delivery/zones.service.ts` (modify) | Zones + types + join reads, store origin, CRUD |
| `lib/delivery/resolve-address.ts` | **unchanged from `43f7249`** |
| `app/api/delivery/check-address/route.ts` (modify) | Returns available types for an address |
| `components/order/address-autocomplete.tsx` | Places Autocomplete input (brutal styling) |
| `components/order/delivery-type-picker.tsx` | Type choice, disabled-with-reason when unaffordable |
| `components/order/delivery-checker.tsx` | Public "do we deliver to you?" |
| `app/(dashboard)/dashboard/catalogue/delivery-types/*` | Types admin |
| `app/(dashboard)/dashboard/catalogue/delivery-zones/*` | Zones admin + map + type checkboxes |

---

### Task 1: Extend the pure matcher for types

**Files:**
- Modify: `apps/puchkaman/lib/delivery/zones.ts`
- Modify: `apps/puchkaman/lib/delivery/__tests__/zones.test.ts`

**Interfaces:**
- Consumes: the existing `Zone` / `deliveryLimitKm` from `a546596`.
- Produces: `DeliveryType`, `ZoneWithTypes`, `availableTypes(distanceKm, zones)`, `zoneForType(distanceKm, typeKey, zones)`. `deliveryLimitKm` unchanged. `matchZone` retained (still used by `zoneForType`).

- [ ] **Step 1: Write the failing tests**

Append to `apps/puchkaman/lib/delivery/__tests__/zones.test.ts`:

```ts
import { availableTypes, zoneForType, type DeliveryType, type ZoneWithTypes } from "../zones";

const instant: DeliveryType = {
  key: "instant", label: "Instant delivery", requiresAddress: true, requiresSchedule: false,
  minSubtotal: 0, discountPct: 15, sortOrder: 1, active: true,
};
const scheduled: DeliveryType = {
  key: "scheduled", label: "Scheduled delivery", requiresAddress: true, requiresSchedule: true,
  minSubtotal: 35, discountPct: 0, sortOrder: 2, active: true,
};

const inner: ZoneWithTypes = { name: "Inner", radiusKm: 7, active: true, types: [instant, scheduled] };
const outer: ZoneWithTypes = { name: "Outer", radiusKm: 20, active: true, types: [scheduled] };
const zones = [outer, inner]; // deliberately unsorted

describe("availableTypes", () => {
  it("offers every type of every covering zone, deduplicated", () => {
    expect(availableTypes(3, zones).map((t) => t.key)).toEqual(["instant", "scheduled"]);
  });

  it("offers only the outer zone's types beyond the inner radius", () => {
    expect(availableTypes(12, zones).map((t) => t.key)).toEqual(["scheduled"]);
  });

  it("treats a distance exactly on a boundary as inside", () => {
    expect(availableTypes(7, zones).map((t) => t.key)).toEqual(["instant", "scheduled"]);
  });

  it("returns nothing beyond every zone", () => {
    expect(availableTypes(20.01, zones)).toEqual([]);
  });

  it("skips inactive zones", () => {
    expect(availableTypes(3, [{ ...inner, active: false }, outer]).map((t) => t.key)).toEqual(["scheduled"]);
  });

  it("skips inactive types", () => {
    const zonesWithDead = [{ ...inner, types: [{ ...instant, active: false }, scheduled] }];
    expect(availableTypes(3, zonesWithDead).map((t) => t.key)).toEqual(["scheduled"]);
  });

  it("orders by type sortOrder", () => {
    const reordered = [{ ...inner, types: [{ ...scheduled, sortOrder: 1 }, { ...instant, sortOrder: 2 }] }];
    expect(availableTypes(3, reordered).map((t) => t.key)).toEqual(["scheduled", "instant"]);
  });
});

describe("zoneForType", () => {
  it("returns the smallest zone offering the requested type", () => {
    expect(zoneForType(3, "scheduled", zones)?.name).toBe("Inner");
  });

  it("falls through to a larger zone when the smaller does not offer it", () => {
    expect(zoneForType(12, "scheduled", zones)?.name).toBe("Outer");
  });

  it("returns null when the type is not offered at that distance", () => {
    expect(zoneForType(12, "instant", zones)).toBeNull();
  });

  it("returns null beyond every zone", () => {
    expect(zoneForType(99, "scheduled", zones)).toBeNull();
  });
});
```

The dedupe test is the load-bearing one: `scheduled` is offered by both zones and must appear once.
The "unsorted zones" fixture guards a first-match implementation.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter puchkaman test -- zones`
Expected: FAIL — `availableTypes` / `zoneForType` not exported.

- [ ] **Step 3: Implement**

Add to `apps/puchkaman/lib/delivery/zones.ts`, keeping the existing exports:

```ts
/** A delivery option and its rules. Rules live on the type, geography on the zone. */
export type DeliveryType = {
  key: string;
  label: string;
  requiresAddress: boolean;
  requiresSchedule: boolean;
  minSubtotal: number;
  discountPct: number;
  sortOrder: number;
  active: boolean;
};

export type ZoneWithTypes = Zone & { types: DeliveryType[] };

/**
 * Every active type offered by every active zone covering this distance, deduplicated by key
 * and ordered by sortOrder. Empty means no delivery here — the caller offers pickup instead.
 */
export function availableTypes(distanceKm: number, zones: ZoneWithTypes[]): DeliveryType[] {
  const byKey = new Map<string, DeliveryType>();
  for (const zone of zones) {
    if (!zone.active || distanceKm > zone.radiusKm) continue;
    for (const type of zone.types) {
      if (type.active && !byKey.has(type.key)) byKey.set(type.key, type);
    }
  }
  return [...byKey.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Smallest active zone covering this distance that offers the given type. */
export function zoneForType(
  distanceKm: number,
  typeKey: string,
  zones: ZoneWithTypes[],
): Zone | null {
  return (
    zones
      .filter((z) => z.active && distanceKm <= z.radiusKm)
      .filter((z) => z.types.some((t) => t.active && t.key === typeKey))
      .sort((a, b) => a.radiusKm - b.radiusKm)[0] ?? null
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter puchkaman test -- zones`
Expected: PASS — the 9 existing tests plus 11 new.

- [ ] **Step 5: Commit**

```bash
git add apps/puchkaman/lib/delivery
git commit -m "feat(puchkaman): match delivery types available at a distance"
```

---

### Task 2: Types, zones and join schema

**Files:**
- Create: `apps/puchkaman/db/schema/delivery-types.ts`
- Modify: `apps/puchkaman/db/schema/delivery-zones.ts`, `db/schema/orders.ts`, `db/schema/index.ts`
- Modify: `apps/puchkaman/lib/delivery/zones.service.ts`
- Test: `apps/puchkaman/lib/delivery/__tests__/zones.service.test.ts`

**Interfaces:**
- Consumes: `Zone`, `DeliveryType`, `ZoneWithTypes` (Task 1).
- Produces: `deliveryTypes`, `deliveryZones`, `deliveryZoneTypes` tables; `getZonesWithTypes()`, `getDeliveryTypes()`, `getStoreOrigin()`, plus CRUD for both catalogues and the join.

- [ ] **Step 1: Regenerate the migration**

Migration `0006_clear_redwing.sql` (from the superseded plan) has only ever run on a dev machine and on this unmerged branch, so it may be replaced rather than stacked on:

```bash
pnpm --filter puchkaman exec drizzle-kit drop   # confirm it targets 0006
```

State in your report that you did this and why.

- [ ] **Step 2: Write the schema**

`db/schema/delivery-types.ts`:

```ts
import { updatableColumns } from "@realm/database";
import { boolean, integer, numeric, pgTable, text } from "drizzle-orm/pg-core";

/** A delivery option and its rules. Operator-extensible: rows, not an enum. */
export const deliveryTypes = pgTable("delivery_types", {
  ...updatableColumns("dty"),
  /** Stable machine key, set once at creation and never edited — orders reference it. */
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  description: text("description"),
  requiresAddress: boolean("requires_address").notNull().default(true),
  requiresSchedule: boolean("requires_schedule").notNull().default(false),
  minSubtotal: numeric("min_subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
  discountPct: numeric("discount_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});
```

`db/schema/delivery-zones.ts` — geography only, plus the join:

```ts
export const deliveryZones = pgTable("delivery_zones", {
  ...updatableColumns("zon"),
  name: text("name").notNull(),
  radiusKm: numeric("radius_km", { precision: 6, scale: 2 }).notNull(),
  active: boolean("active").notNull().default(true),
});

export const deliveryZoneTypes = pgTable("delivery_zone_types", {
  ...updatableColumns("dzt"),
  zoneId: bigint("zone_id", { mode: "bigint" }).notNull().references(() => deliveryZones.id),
  typeId: bigint("type_id", { mode: "bigint" }).notNull().references(() => deliveryTypes.id),
}, (t) => [uniqueIndex("delivery_zone_types_zone_type_unique").on(t.zoneId, t.typeId)]);
```

`db/schema/orders.ts` — replace the single `deliveryZoneId` from the superseded plan with both:

```ts
    deliveryTypeId: bigint("delivery_type_id", { mode: "bigint" }).references(() => deliveryTypes.id),
    deliveryZoneId: bigint("delivery_zone_id", { mode: "bigint" }).references(() => deliveryZones.id),
```

There must be **no `delivery_fee` column**. Export everything from `db/schema/index.ts`.

- [ ] **Step 3: Generate, inspect and seed**

```bash
pnpm --filter puchkaman db:generate
```

**Read the SQL before applying.** Expected: three `CREATE TABLE`s (or two plus alterations if the old
`delivery_zones` shape persists), `ADD COLUMN` on `app` and `orders`, and FK constraints. **Any `DROP`
or `ALTER COLUMN` against a table that existed before this branch — stop and report BLOCKED.**
Changes to `delivery_zones` itself are fine; it was created on this branch.

Append the seed. **Every NOT NULL column without a database default must be supplied** — `public_id`,
`created_at`, `updated_at` — because `$defaultFn` does not fire for raw SQL:

```sql
--> statement-breakpoint
INSERT INTO "delivery_types"
  ("public_id","created_at","updated_at","key","label","requires_address","requires_schedule","min_subtotal","discount_pct","sort_order")
VALUES
  ('dty_pickup',    (EXTRACT(EPOCH FROM now())*1000)::bigint, (EXTRACT(EPOCH FROM now())*1000)::bigint, 'pickup',    'Pickup',             false, false,  0,  0, 0),
  ('dty_instant',   (EXTRACT(EPOCH FROM now())*1000)::bigint, (EXTRACT(EPOCH FROM now())*1000)::bigint, 'instant',   'Instant delivery',   true,  false,  0, 15, 1),
  ('dty_scheduled', (EXTRACT(EPOCH FROM now())*1000)::bigint, (EXTRACT(EPOCH FROM now())*1000)::bigint, 'scheduled', 'Scheduled delivery', true,  true,  35,  0, 2);
--> statement-breakpoint
INSERT INTO "delivery_zones" ("public_id","created_at","updated_at","name","radius_km")
VALUES
  ('zon_inner', (EXTRACT(EPOCH FROM now())*1000)::bigint, (EXTRACT(EPOCH FROM now())*1000)::bigint, 'Inner',  7.00),
  ('zon_outer', (EXTRACT(EPOCH FROM now())*1000)::bigint, (EXTRACT(EPOCH FROM now())*1000)::bigint, 'Outer', 20.00);
--> statement-breakpoint
INSERT INTO "delivery_zone_types" ("public_id","created_at","updated_at","zone_id","type_id")
SELECT 'dzt_' || z.name || '_' || t.key,
       (EXTRACT(EPOCH FROM now())*1000)::bigint, (EXTRACT(EPOCH FROM now())*1000)::bigint,
       z.id, t.id
FROM "delivery_zones" z JOIN "delivery_types" t ON true
WHERE (z.name = 'Inner' AND t.key IN ('instant','scheduled'))
   OR (z.name = 'Outer' AND t.key = 'scheduled');
```

Confirm the `public_id` literals match the format `makePublicId` produces for those prefixes
(`packages/database/src/columns.ts`); adjust if it validates a shape.

- [ ] **Step 4: Apply locally and verify the seed reads back**

```bash
pnpm --filter puchkaman db:migrate
```

If your local database is in a broken mid-state from earlier work, reset it and re-run from clean
rather than hand-patching tables. Then confirm `getZonesWithTypes()` returns Inner with two types and
Outer with one. If no database is reachable, say so plainly — but the SQL must be correct by
inspection, and an unapplied migration is an unreviewed migration.

- [ ] **Step 5: Write the failing service test**

Extend `zones.service.test.ts` to cover both row converters — `rowToZone` and a new `rowToType` —
asserting numeric strings become numbers (`minSubtotal: "35.00"` → `35`, `discountPct: "15.00"` → `15`).
`toEqual` against numeric literals is what makes this test fail if a conversion is dropped.

- [ ] **Step 6: Implement the service**

Extend `lib/delivery/zones.service.ts`:

- `rowToType(row)` — numeric strings to numbers, same discipline as `rowToZone`.
- `getDeliveryTypes(): Promise<DeliveryType[]>` — active only, ordered by `sortOrder`.
- `getZonesWithTypes(): Promise<ZoneWithTypes[]>` — one query joining zones → join → types, grouped
  in JS. Do not N+1 per zone.
- `saveDeliveryType`, `retireDeliveryType`, `saveZone`, `retireZone`, `setZoneTypes(zoneId, typeIds)`
  — all through `SessionUpdatableService`, matching `lib/services/integrations.service.ts`.

`setZoneTypes` replaces a zone's join rows wholesale (delete-then-insert inside one transaction), so
the admin's checkbox state is authoritative.

- [ ] **Step 7: Verify**

Run: `pnpm --filter puchkaman test -- zones`
Expected: PASS.

Typecheck will still fail on the four consumers of the deleted constants — that is Task 4/5's
worklist, unchanged from the superseded plan. Report the exact list.

- [ ] **Step 8: Commit**

```bash
git add apps/puchkaman/db apps/puchkaman/lib
git commit -m "feat(puchkaman): delivery types, geography-only zones, and their join"
```

---

### Task 3: Address-aware check endpoint

**Files:**
- Modify: `apps/puchkaman/app/api/delivery/check-address/route.ts`

**Interfaces:**
- Consumes: `resolveAddress` (existing, `43f7249`), `getZonesWithTypes`, `getStoreOrigin`, `availableTypes`, `deliveryLimitKm`.
- Produces: `POST /api/delivery/check-address` → `{ resolved, distanceKm, limitKm, types[] }`.

- [ ] **Step 1: Rewrite the route**

Read the current file first; keep it public, keep the `handler`/`json`/`problem` helpers, and keep the
comment stating that `createCheckout` re-derives everything server-side.

Accept `{ address, placeId? }`. **Never accept coordinates.** Respond:

```ts
// deliverable
{ resolved: true, formattedAddress: "12 Elm St", distanceKm: 2.4, limitKm: 20,
  types: [{ key: "instant", label: "Instant delivery", minSubtotal: 0, discountPct: 15, requiresSchedule: false }, ...] }
// resolvable but too far
{ resolved: true, formattedAddress: "40 Bay St", distanceKm: 24, limitKm: 20, types: [] }
// unresolvable
{ resolved: false }
```

`limitKm` comes from `deliveryLimitKm` — never a literal, or the customer-facing message drifts the
first time an admin edits a radius. `types: []` is the "pickup only" signal; the route does not
special-case it.

Do **not** return the zone — the customer does not need it and it is re-derived server-side at
checkout anyway.

- [ ] **Step 2: Verify**

Run: `pnpm --filter puchkaman typecheck`
Expected: this file no longer appears in the failures; the three component files still do.

- [ ] **Step 3: Commit**

```bash
git add apps/puchkaman/app/api/delivery
git commit -m "feat(puchkaman): return available delivery types for an address"
```

---

### Task 4: Checkout on types

**Files:**
- Modify: `apps/puchkaman/lib/orders/checkout-schema.ts`
- Modify: `apps/puchkaman/lib/services/orders.service.ts`
- Test: `apps/puchkaman/lib/orders/__tests__/orders-checkout-schema.test.ts`
- Test: `apps/puchkaman/lib/delivery/__tests__/type-pricing.test.ts`

**Interfaces:**
- Consumes: `availableTypes`, `zoneForType`, `deliveryLimitKm`, `getZonesWithTypes`, `getStoreOrigin`, `resolveAddress`.
- Produces: `applyTypeDiscount({ subtotal, type })` → `{ discountAmount }`.

- [ ] **Step 1: Write the failing tests**

`type-pricing.test.ts`:

```ts
it("discounts the subtotal by the type percentage", () => {
  expect(applyTypeDiscount({ subtotal: 100, type: { ...instant, discountPct: 15 } }))
    .toEqual({ discountAmount: 15 });
});

it("is zero for a type with no discount", () => {
  expect(applyTypeDiscount({ subtotal: 100, type: scheduled })).toEqual({ discountAmount: 0 });
});

it("rounds to two decimals", () => {
  expect(applyTypeDiscount({ subtotal: 33.33, type: { ...instant, discountPct: 15 } }).discountAmount)
    .toBe(5);
});
```

Schema tests — the trust boundary:

```ts
it("accepts a delivery type key and a placeId", () => { /* expect success */ });

it("REJECTS client-supplied coordinates", () => { /* lat/lng → success === false */ });

it("REJECTS a client-supplied discount or distance", () => { /* discountPct / distanceKm → false */ });
```

Use `.strict()` on the delivery branch — zod's default is to *strip* unknown keys silently, so
without it a tampered payload parses successfully and the test would pass for the wrong reason.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter puchkaman test -- type-pricing checkout-schema`

- [ ] **Step 3: Implement `applyTypeDiscount`**

`lib/delivery/type-pricing.ts`:

```ts
const money = (n: number): number => Math.round(n * 100) / 100;

/** The only money effect of delivery. There is no fee — see the spec's non-goals. */
export function applyTypeDiscount(input: { subtotal: number; type: DeliveryType }): {
  discountAmount: number;
} {
  return { discountAmount: money(input.subtotal * (input.type.discountPct / 100)) };
}
```

- [ ] **Step 4: Update the wire schema**

`checkout-schema.ts` delivery branch: `{ type: "delivery", deliveryTypeKey: string, address: string, placeId?: string, scheduledFor?: string }`, `.strict()`. Pickup stays as-is.

- [ ] **Step 5: Rewrite the delivery branch in `orders.service.ts`**

Read the whole `createCheckout` first. Preserve `deliveryAddress`, `deliveryLat`, `deliveryLng`,
`deliveryDistanceKm`, `fulfillment`, `discountAmount`, `cloverDiscounts`.

```ts
if (parsed.fulfillment.type === "delivery") {
  const [zones, origin] = await Promise.all([getZonesWithTypes(), getStoreOrigin()]);
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

  // Re-derive what is genuinely offered here. The client sent only a key.
  const offered = availableTypes(deliveryDistanceKm, zones);
  const type = offered.find((t) => t.key === parsed.fulfillment.deliveryTypeKey);
  if (!type) {
    const limit = deliveryLimitKm(zones);
    throw new ValidationError(
      offered.length === 0 && limit != null
        ? `We don't deliver that far yet (${deliveryDistanceKm} km — we deliver up to ${limit} km). Pickup is available.`
        : "That delivery option isn't available for this address.",
    );
  }

  if (subtotal < type.minSubtotal) {
    throw new ValidationError(`${type.label} requires an order over $${type.minSubtotal}.`);
  }
  if (type.requiresSchedule && !parsed.fulfillment.scheduledFor) {
    throw new ValidationError(`Pick a delivery time for ${type.label}.`);
  }

  const zone = zoneForType(deliveryDistanceKm, type.key, zones);
  if (!zone?.id) throw new ValidationError("Could not resolve a delivery zone for that address.");

  fulfillment = type.requiresSchedule ? "delivery_scheduled" : "delivery_instant";

  const { discountAmount: typeOff } = applyTypeDiscount({ subtotal, type });
  if (typeOff > 0) {
    cloverDiscounts.push({ name: `${type.label} discount`, amount: typeOff });
    discountAmount = Number(money(discountAmount + typeOff));
  }

  deliveryTypeId = type.id;
  deliveryZoneId = zone.id;
}
```

`type.id` and `zone.id` are asserted, not defaulted — a `?? null` would turn a future query
regression into silently unattributed orders. `DeliveryType` therefore needs an optional `id` in the
service layer, same as `Zone`.

Persist `deliveryTypeId` and `deliveryZoneId` alongside the existing delivery columns.

- [ ] **Step 6: Verify**

Run: `pnpm --filter puchkaman test && pnpm --filter puchkaman typecheck`
Expected: tests pass; typecheck fails only on the two remaining component files (Task 5).

- [ ] **Step 7: Commit**

```bash
git add apps/puchkaman
git commit -m "feat(puchkaman): checkout prices from the chosen delivery type"
```

---

### Task 5: Address-first checkout UI and the public checker

**Files:**
- Create: `components/order/address-autocomplete.tsx`, `components/order/delivery-type-picker.tsx`, `components/order/delivery-checker.tsx`
- Delete: `components/order/order-direct-cta.tsx`
- Modify: `components/order/checkout-client.tsx`, `app/(marketing)/order/page.tsx`

- [ ] **Step 1: Autocomplete input**

Client component loading Places with `NEXT_PUBLIC_GOOGLE_MAPS_KEY`, biased to the shop origin,
restricted to Canada. Props: `value`, `onChange(address)`, `onPick({ address, placeId })`, `id`,
`className`. **Brutal styling** (`className="input"`), matching `checkout-client.tsx:374`.

A typed address without a picked suggestion must still submit — `placeId` is optional everywhere and
Task 3's text-search fallback covers it.

- [ ] **Step 2: Type picker**

Renders the types returned by the check endpoint as radio cards: label, discount, minimum, and a
"needs a time" hint. A type whose `minSubtotal` exceeds the cart renders **disabled with the reason**
— *"Scheduled delivery — add $12 more to qualify"* — never hidden. A hidden option cannot convert; a
disabled one with a number tells the customer exactly what to do.

- [ ] **Step 3: Public checker, and delete the geolocation CTA**

`delivery-checker.tsx`: autocomplete + Check button, rendering served (address, distance, the list of
available types with their terms), too-far (distance and `limitKm`, plus the pickup address), or
not-found.

Delete `components/order/order-direct-cta.tsx` and replace its usage in `app/(marketing)/order/page.tsx`
(import line 4, render line 164). Afterwards `rg -n "order-direct-cta|navigator.geolocation" apps/puchkaman`
must return nothing.

- [ ] **Step 4: Rewire checkout to address-first**

In `checkout-client.tsx`: replace the `<textarea>` with `<AddressAutocomplete>`; on a successful check,
render `<DeliveryTypePicker>`; require a chosen type before submit; send
`{ deliveryTypeKey, address, placeId?, scheduledFor? }`. Show the scheduled-time field only when the
chosen type has `requiresSchedule`.

- [ ] **Step 5: Verify by eye (tsc cannot catch these)**

1. All three new components start with `"use client";`.
2. `NEXT_PUBLIC_GOOGLE_MAPS_KEY` appears only in client components; `rg -n "GOOGLE_PLACES_API_KEY" apps/puchkaman/components` returns nothing.

- [ ] **Step 6: Verify**

Run: `pnpm --filter puchkaman typecheck && pnpm --filter puchkaman test`
Expected: **fully clean** — this task repairs the last of the deliberate build break.

- [ ] **Step 7: Commit**

```bash
git add -A apps/puchkaman
git commit -m "feat(puchkaman): address-first checkout with a delivery type picker"
```

---

### Task 6: Catalogue admin — types and zones

**Files:**
- Create: `app/(dashboard)/dashboard/catalogue/delivery-types/{page.tsx,actions.ts,type-editor.tsx}`
- Create: `app/(dashboard)/dashboard/catalogue/delivery-zones/{page.tsx,actions.ts,zone-editor.tsx,zone-map.tsx}`
- Modify: the dashboard sidebar, `dashboard/settings/page.tsx`, `dashboard/orders/[id]/page.tsx`
- Modify: `apps/puchkaman/package.json` (add `@react-google-maps/api`)

- [ ] **Step 1: Add the dependency**

`"@react-google-maps/api": "^2.20.3"`, then `pnpm install` from the repo root. Report the resolved version.

- [ ] **Step 2: Sidebar Catalogue group**

Add a **Catalogue** group to the puchkaman dashboard nav containing *Delivery types* and *Delivery
zones*. Read `components/dashboard/app-sidebar.tsx` and follow its existing section structure; keep
`AppSidebar` and `AppBottomNav` consistent, since they share `getNavSections`.

- [ ] **Step 3: Delivery types admin**

List with inline editing: label, description, minimum subtotal, discount %, requires-address,
requires-schedule, sort order, active. Creating a type sets `key` once; **`key` is immutable
afterwards** — orders and the fulfilment mapping reference it, so render it read-only on edit.

Server actions: `requireAdmin()` first, `recordAudit` after a successful write, `revalidatePath`,
**return `{ error?: string }` and never throw**. Validate with zod: `discountPct` 0–100,
`minSubtotal >= 0`, `key` matching `^[a-z][a-z0-9_]*$` and unique.

Retire is **soft** (`active = false`). Never wire the inherited hard `delete()` — `orders.delivery_type_id`
is `ON DELETE no action` and hard-deleting a referenced row errors at the FK.

- [ ] **Step 4: Delivery zones admin with the map**

Split pane: map left, zone cards right.

```tsx
<GoogleMap center={origin} zoom={11}>
  <Marker position={origin} draggable onDragEnd={(e) => onOriginChange(e.latLng)} />
  {zones.map((z) => (
    <Circle
      key={z.publicId}
      center={origin}
      radius={z.radiusKm * 1000}          // Google works in metres, we store km
      editable
      draggable={false}                    // concentric by definition; only the pin moves
      options={{ fillColor: z.color, fillOpacity: 0.15, strokeColor: z.color, strokeWeight: 2 }}
      onRadiusChanged={/* read radius off the circle ref, convert, clamp, commit */}
    />
  ))}
</GoogleMap>
```

`onRadiusChanged` fires with **no argument** — hold a ref per circle and call `getRadius()`. Clamp
between the next-smaller and next-larger active zone before committing so a drag cannot reorder the
rings.

Each zone card carries: name, radius (number input, arrow-key steppable), **type checkboxes** wired
to `setZoneTypes`, and retire. **Every value must be editable from the form, not only the map** — a
drag-only editor is unusable by keyboard.

- [ ] **Step 5: Surface the type and zone on the order detail**

`dashboard/orders/[id]/page.tsx:69-88` already shows address, distance and scheduled time. Add the
delivery type label and zone name.

- [ ] **Step 6: Verify by eye**

1. `zone-map.tsx`, `zone-editor.tsx`, `type-editor.tsx` start with `"use client";`.
2. Pages pass plain JSON — no functions, no Drizzle rows.
3. `@react-google-maps/api` is never imported by a server component.
4. No UI path reaches a hard `delete()`.

- [ ] **Step 7: Verify**

Run: `pnpm --filter puchkaman typecheck && pnpm --filter puchkaman test`

Manual check with `NEXT_PUBLIC_GOOGLE_MAPS_KEY` set: add a type, attach it to a zone, confirm it
appears in the public checker for an address in that zone; drag a radius and confirm the number input
tracks it and cannot cross a neighbour; move the shop pin and confirm circles follow.

- [ ] **Step 8: Commit**

```bash
git add -A apps/puchkaman pnpm-lock.yaml
git commit -m "feat(puchkaman): catalogue admin for delivery types and zones"
```

---

## Post-plan: operator steps

1. Create `NEXT_PUBLIC_GOOGLE_MAPS_KEY` — Maps JavaScript + Places enabled, **HTTP referrer
   restricted**, **daily quota cap set**. The key is public by design; the cap is what stops a copied
   key running up a bill. Add to env and SSM.
2. Confirm `GOOGLE_PLACES_API_KEY` (server) is set — currently only the reviews plugin uses it.
3. Apply the migration.
4. **Set the true outer radius.** Seeded at 20 km. Today scheduled delivery is accepted at *any*
   distance provided the order clears $35, so anything beyond the outer zone starts being refused on
   deploy. Watch for lost orders past that ring.
5. Check the shop pin in Catalogue → Delivery zones; it defaults to the previously hardcoded coords.

## Follow-ups (out of scope)

- Lift `lib/delivery/*` into `@realm/delivery` when tiffin-grab adopts it.
- Cache Places Details by `place_id`.
- Driving distance via Distance Matrix.
- Per-type lead times and delivery windows.
