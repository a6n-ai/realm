# Plan-type + Pricing Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the weekly-fee pricing model with per-tiffin volume-tiered pricing, and add explicit plan types (tiffin/healthy) with per-plan offered slots.

**Architecture:** A new `pricingTiers` table holds quantity bands with a %-uplift on `mealSize.basePrice`. The pricing engine becomes a pure function of (basePrice, tiers, delivery-days, weeks, persons) → per-tiffin price × tiffin count, with an empty `adjustments` hook reserved for a future coupon slice. `plans` gains `planType` + `offeredSlots`; order creation validates the chosen slots against the plan. All existing pricing consumers (wizard, agent order form, dashboard, checkout) move to the new shape.

**Tech Stack:** Next.js 16 (modified — read `node_modules/next/dist/docs/` before framework code), Drizzle ORM + drizzle-kit, Postgres, Vitest, pnpm. Design-system components in `apps/web/components/ds/`.

## Global Constraints

- All commands run from `apps/web/`.
- drizzle-kit / tsx / vitest do NOT load `.env.local` — prefix every such command with `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin"`.
- Tests share + wipe the dev DB; after any test run that wipes it, reseed: `pnpm db:seed && pnpm db:seed:catalog && pnpm db:seed:menu && pnpm db:seed:admin`.
- Vitest can't eval NextAuth: a test importing a session service must `vi.mock("@/lib/auth", () => ({ auth: async () => null }))` then `await import(...)`.
- IDs are dual: internal snowflake `bigint id` + public `public_id` (nanoid, 3-letter prefix). New table `pricingTiers` uses `updatableColumns("ptr")`. Timestamps are epoch-ms.
- Commit messages: plain, NO `Co-Authored-By` trailer.
- Verify gate per task as specified; the full-green gate is Task 4 (`pnpm test && pnpm typecheck && pnpm build`).
- Branch is `crm/slice-1-plan-type-pricing` (already created).

**Note on build-green ordering:** Tasks 1 and 2 are additive (app stays green). Task 3 rewrites the pricing engine + shared types; the app build is expected to be RED after Task 3 (consumers still use the old shape) and GREEN again after Task 4, which is the atomic integration task. Engine *unit tests* pass at the end of Task 3.

---

### Task 1: `pricingTiers` table, service, admin, seed, and tier-validation helper

**Files:**
- Modify: `db/schema/catalog.ts` (add `pricingTiers` table)
- Create: `lib/pricing/tiers.ts` (pure `assertValidTiers` + `findTier`)
- Create: `lib/pricing/tiers.test.ts`
- Modify: `lib/services/catalog.service.ts` (add `pricingTierService`)
- Modify: `app/(dashboard)/dashboard/catalog/resource-config.ts` (add `pricing-tiers` resource)
- Modify: `app/(dashboard)/dashboard/catalog/[resource]/page.tsx` (add to `TABLES`)
- Modify: `db/seed-catalog.ts` (seed tier bands)

**Interfaces:**
- Produces: `PricingTier = { minQty: number; maxQty: number | null; upliftPct: number }`
- Produces: `assertValidTiers(tiers: PricingTier[]): void` — throws `ValidationError` if the set is not a contiguous cover of `1..∞`.
- Produces: `findTier(tiers: PricingTier[], qty: number): PricingTier` — returns the matching band; throws `ValidationError` if none.
- Produces: `pricingTierService` (CRUD via `UpdatableRepository`, soft-delete).

- [ ] **Step 1: Write the failing test for the tier helper**

Create `lib/pricing/tiers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assertValidTiers, findTier, type PricingTier } from "./tiers";

const good: PricingTier[] = [
  { minQty: 1, maxQty: 11, upliftPct: 20 },
  { minQty: 12, maxQty: 19, upliftPct: 10 },
  { minQty: 20, maxQty: null, upliftPct: 0 },
];

describe("assertValidTiers", () => {
  it("accepts a contiguous cover starting at 1 with one unbounded top", () => {
    expect(() => assertValidTiers(good)).not.toThrow();
  });
  it("rejects when the first band does not start at 1", () => {
    expect(() => assertValidTiers([{ minQty: 2, maxQty: null, upliftPct: 0 }])).toThrow();
  });
  it("rejects a gap between bands", () => {
    expect(() => assertValidTiers([
      { minQty: 1, maxQty: 10, upliftPct: 10 },
      { minQty: 12, maxQty: null, upliftPct: 0 },
    ])).toThrow();
  });
  it("rejects an overlap between bands", () => {
    expect(() => assertValidTiers([
      { minQty: 1, maxQty: 12, upliftPct: 10 },
      { minQty: 10, maxQty: null, upliftPct: 0 },
    ])).toThrow();
  });
  it("rejects when there is no unbounded top band", () => {
    expect(() => assertValidTiers([{ minQty: 1, maxQty: 19, upliftPct: 0 }])).toThrow();
  });
  it("rejects a negative uplift", () => {
    expect(() => assertValidTiers([{ minQty: 1, maxQty: null, upliftPct: -1 }])).toThrow();
  });
});

describe("findTier", () => {
  it("matches the band containing the quantity", () => {
    expect(findTier(good, 11).upliftPct).toBe(20);
    expect(findTier(good, 12).upliftPct).toBe(10);
    expect(findTier(good, 24).upliftPct).toBe(0);
  });
  it("throws when no band matches (qty below 1)", () => {
    expect(() => findTier(good, 0)).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/pricing/tiers.test.ts`
Expected: FAIL — `Cannot find module './tiers'`.

- [ ] **Step 3: Implement the tier helper**

Create `lib/pricing/tiers.ts`:

```ts
import { ValidationError } from "@tiffin/commons";

export interface PricingTier {
  minQty: number;
  maxQty: number | null; // null = unbounded top band
  upliftPct: number;
}

// Active tiers must form a contiguous cover of 1..∞: sorted by minQty, the first
// starts at 1, each next minQty is exactly prev.maxQty + 1, and exactly one band
// (the last) is unbounded. Uplift must be non-negative.
export function assertValidTiers(tiers: PricingTier[]): void {
  if (tiers.length === 0) throw new ValidationError("No pricing tiers configured");
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  if (sorted[0].minQty !== 1) throw new ValidationError("Pricing tiers must start at quantity 1");

  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    if (t.upliftPct < 0) throw new ValidationError("Pricing tier uplift cannot be negative");
    const isLast = i === sorted.length - 1;
    if (isLast) {
      if (t.maxQty !== null) throw new ValidationError("The top pricing tier must be unbounded (no max)");
    } else {
      if (t.maxQty === null) throw new ValidationError("Only the top pricing tier may be unbounded");
      if (t.maxQty < t.minQty) throw new ValidationError("Pricing tier max must be ≥ min");
      if (sorted[i + 1].minQty !== t.maxQty + 1) throw new ValidationError("Pricing tiers must be contiguous (no gaps or overlaps)");
    }
  }
}

export function findTier(tiers: PricingTier[], qty: number): PricingTier {
  const match = tiers.find((t) => qty >= t.minQty && (t.maxQty === null || qty <= t.maxQty));
  if (!match) throw new ValidationError(`No pricing tier matches quantity ${qty}`);
  return match;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/pricing/tiers.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Add the `pricingTiers` table to the schema**

In `db/schema/catalog.ts`, append after `durationPackages` (keep imports — `numeric`, `integer`, `boolean`, `pgTable` are already imported):

```ts
export const pricingTiers = pgTable("pricing_tiers", {
  ...updatableColumns("ptr"),
  minQty: integer("min_qty").notNull(),
  maxQty: integer("max_qty"), // null = unbounded top band
  upliftPct: numeric("uplift_pct", { precision: 5, scale: 2 }).notNull(),
  active: boolean("active").notNull().default(true),
});
```

- [ ] **Step 6: Register the service**

In `lib/services/catalog.service.ts`, add `pricingTiers` to the schema import and add the service export beside the others:

```ts
// add pricingTiers to the existing import from "@/db/schema"
export const pricingTierService = new SoftDeleteService(new UpdatableRepository(db, pricingTiers, pricingTiers.publicId, pricingTiers.id));
```

- [ ] **Step 7: Add the admin resource config**

In `app/(dashboard)/dashboard/catalog/resource-config.ts`, add to `RESOURCES`:

```ts
  "pricing-tiers": {
    key: "pricing-tiers",
    label: "Pricing tiers",
    fields: [
      { key: "minQty", label: "Min qty", type: "number" },
      { key: "maxQty", label: "Max qty (blank = unbounded)", type: "number", optional: true },
      { key: "upliftPct", label: "Uplift %", type: "number" },
    ],
  },
```

In `app/(dashboard)/dashboard/catalog/[resource]/page.tsx`, add `pricingTiers` to the schema import and to the `TABLES` map:

```ts
  "pricing-tiers": pricingTiers,
```

- [ ] **Step 8: Seed the tier bands**

In `db/seed-catalog.ts`, add `pricingTiers` to the schema import, add the constant, and add the seed loop in `main`:

```ts
const PRICING_TIERS = [
  { minQty: 1, maxQty: 11, upliftPct: "20.00" },
  { minQty: 12, maxQty: 19, upliftPct: "10.00" },
  { minQty: 20, maxQty: null, upliftPct: "0.00" },
];
```

```ts
  // inside main(), alongside the other seed loops:
  for (const t of PRICING_TIERS) await db.insert(pricingTiers).values(t).onConflictDoNothing();
```

- [ ] **Step 9: Generate + apply the migration, then reseed**

Run:
```bash
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:generate
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:migrate
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:seed:catalog
```
Expected: a new migration in `db/migrations/`, applied cleanly; seed prints the catalog summary.

- [ ] **Step 10: Verify typecheck + the new test, then commit**

Run: `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm typecheck && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/pricing/tiers.test.ts`
Expected: typecheck clean; tier tests PASS.

```bash
git add db/schema/catalog.ts lib/pricing/tiers.ts lib/pricing/tiers.test.ts lib/services/catalog.service.ts "app/(dashboard)/dashboard/catalog/resource-config.ts" "app/(dashboard)/dashboard/catalog/[resource]/page.tsx" db/seed-catalog.ts db/migrations
git commit -m "feat(catalog): add pricing tiers table, service, admin, and validation helper"
```

---

### Task 2: `plans.planType` + `offeredSlots`, snapshot wiring, seed, admin fields

**Files:**
- Modify: `db/schema/catalog.ts` (add `planType` enum + `plans.planType` + `plans.offeredSlots`)
- Modify: `lib/catalog/types.ts` (`CatalogSnapshot.plans` + `ClientCatalogSnapshot.plans` gain the fields; `CatalogSnapshot` gains `tiers`)
- Modify: `lib/catalog/load.ts` (select the new plan fields + load tiers)
- Modify: `db/seed-catalog.ts` (give seeded plans a type + offered slots; add a healthy plan)
- Modify: `app/(dashboard)/dashboard/catalog/resource-config.ts` (plans editor: planType select + offeredSlots csv)

**Interfaces:**
- Consumes: `PricingTier` (Task 1).
- Produces: `CatalogSnapshot.plans[].planType: "tiffin" | "healthy"`, `CatalogSnapshot.plans[].offeredSlots: string[]`, `CatalogSnapshot.tiers: PricingTier[]`.

- [ ] **Step 1: Add the enum + columns to the schema**

In `db/schema/catalog.ts`, add the enum near the top enums:

```ts
export const planType = pgEnum("plan_type", ["tiffin", "healthy"]);
```

Add to the `plans` table definition:

```ts
  planType: planType("plan_type").notNull().default("tiffin"),
  offeredSlots: text("offered_slots").array().notNull().default([]),
```

- [ ] **Step 2: Extend the snapshot types**

In `lib/catalog/types.ts`:

Add the import at the top:
```ts
import type { PricingTier } from "@/lib/pricing/tiers";
```

Change the server `CatalogSnapshot.plans` element and add `tiers`:
```ts
  plans: { id: bigint; publicId: string; key: string; name: string; description: string | null; planType: "tiffin" | "healthy"; offeredSlots: string[] }[];
  // ...existing mealSizes/addons/frequencies/durations/zones unchanged...
  tiers: PricingTier[];
```

Change the `ClientCatalogSnapshot.plans` element to match (no `id`):
```ts
  plans: { publicId: string; key: string; name: string; description: string | null; planType: "tiffin" | "healthy"; offeredSlots: string[] }[];
```

`toClientCatalog` needs no change for plans (it maps `dropId`). Add `tiers` passthrough is NOT needed on the client snapshot — leave `ClientCatalogSnapshot` without `tiers` (the client never reprices locally).

- [ ] **Step 3: Load the new fields + tiers**

In `lib/catalog/load.ts`:

Add `pricingTiers` to the schema import. Add the query to the `Promise.all` (and capture it):
```ts
    db.select().from(pricingTiers).where(eq(pricingTiers.active, true)),
```
Map the plan rows to include the new fields:
```ts
    plans: planRows.map((p) => ({ id: p.id, publicId: p.publicId, key: p.key, name: p.name, description: p.description, planType: p.planType, offeredSlots: p.offeredSlots })),
```
Add `tiers` to the returned object:
```ts
    tiers: tierRows.map((t) => ({ minQty: t.minQty, maxQty: t.maxQty, upliftPct: Number(t.upliftPct) })),
```
(Use the variable name you destructured the tiers query into, e.g. `tierRows`.)

- [ ] **Step 4: Seed plan types + a healthy plan**

In `db/seed-catalog.ts`, update `PLANS` to carry `planType` + `offeredSlots`, and add a healthy plan:

```ts
const PLANS = [
  { key: "veg", name: "Pure Vegetarian Plan", description: "Seasonal vegetables, paneer, daal, rotis, raitas.", planType: "tiffin" as const, offeredSlots: ["lunch"] },
  { key: "halal_nonveg", name: "Halal Non-Veg Plan", description: "Poultry, mutton, egg masalas, daals, chapatis.", planType: "tiffin" as const, offeredSlots: ["lunch"] },
  { key: "mixed", name: "Veg & Non-Veg Mixed Plan", description: "Alternating vegetarian and non-vegetarian days.", planType: "tiffin" as const, offeredSlots: ["lunch"] },
  { key: "healthy", name: "Healthy Plan", description: "Breakfast, lunch, and dinner — pick the slots you want.", planType: "healthy" as const, offeredSlots: ["breakfast", "lunch", "dinner"] },
];
```

The seed insert already does `onConflictDoNothing({ target: plans.key })`; the new columns are inserted with the row. For the three existing plans to gain the columns on a DB that already has them, the migrate-fresh dev flow (Task 1 Step 9 already re-ran) plus this reseed covers it. If rows pre-exist, run the reseed in Step 6 against a fresh DB.

> The healthy plan's `offeredSlots` reference slot keys `breakfast`/`dinner`. These must exist + be enabled in `mealSlots` for later slices; confirm `db/seed-menu.ts` seeds `breakfast`, `lunch`, `dinner`. If it only seeds `lunch`, add `breakfast` and `dinner` rows there (`{ key, label, enabled: true, sortOrder }`). This is required only for slices 2–3 UI, not for pricing; note it but do not block this task on it.

- [ ] **Step 5: Add plans admin fields**

In `app/(dashboard)/dashboard/catalog/resource-config.ts`, extend the `plans` resource `fields`:

```ts
      { key: "planType", label: "Plan type", type: "select", options: ["tiffin", "healthy"] },
      { key: "offeredSlots", label: "Offered slots", type: "csv" },
```

- [ ] **Step 6: Migrate, reseed, verify, commit**

Run:
```bash
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:generate
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:migrate
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:seed:catalog
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm typecheck
```
Expected: migration applied; seed prints 4 plans; typecheck clean.

```bash
git add db/schema/catalog.ts lib/catalog/types.ts lib/catalog/load.ts db/seed-catalog.ts "app/(dashboard)/dashboard/catalog/resource-config.ts" db/migrations
git commit -m "feat(catalog): add plan types and offered slots; load pricing tiers into snapshot"
```

---

### Task 3: Rewrite the pricing engine to per-tiffin volume-tiered pricing

**Files:**
- Modify: `lib/pricing/types.ts` (new `PricingSelections`, `PricingCatalog`, `PricingResult`)
- Modify: `lib/pricing/engine.ts` (rewrite `priceSubscription`)
- Modify: `lib/pricing/index.ts` (drop `STUDENT_DISCOUNT_PCT` export)
- Modify: `lib/pricing/build-catalog.ts` (provide tiers; drop addons/duration/courier inputs)
- Rewrite: `lib/pricing/engine.test.ts`

**Interfaces:**
- Consumes: `PricingTier`, `findTier`, `assertValidTiers` (Task 1); `CatalogSnapshot.tiers` (Task 2).
- Produces (the new shapes downstream tasks rely on):
```ts
interface PricingSelections {
  mealSizeId: string;
  frequencyKey: "5_day" | "mwf";
  persons: number;
  mealSlots: string[];
  includeSaturday: boolean;
  includeSunday: boolean;
  durationWeeks: number;
}
interface PricingCatalog {
  mealSize: { id: string; basePrice: number };
  frequency: { key: string; daysPerWeek: number };
  tiers: PricingTier[];
}
interface PricingLine { label: string; amount: number; }
interface PricingResult {
  lineItems: PricingLine[];
  adjustments: PricingLine[]; // coupon hook — always [] this slice
  tiffinCount: number;
  perTiffinPrice: number;
  tier: PricingTier;
  subtotal: number;
  total: number;
}
```
- `STUDENT_DISCOUNT_PCT` is removed.

- [ ] **Step 1: Rewrite the engine test**

Replace the contents of `lib/pricing/engine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { priceSubscription } from "./engine";
import type { PricingCatalog, PricingSelections } from "./types";
import type { PricingTier } from "./tiers";

const TIERS: PricingTier[] = [
  { minQty: 1, maxQty: 11, upliftPct: 20 },
  { minQty: 12, maxQty: 19, upliftPct: 10 },
  { minQty: 20, maxQty: null, upliftPct: 0 },
];

const catalog = (basePrice = 10, freqKey: "5_day" | "mwf" = "5_day"): PricingCatalog => ({
  mealSize: { id: "m1", basePrice },
  frequency: freqKey === "5_day" ? { key: "5_day", daysPerWeek: 5 } : { key: "mwf", daysPerWeek: 3 },
  tiers: TIERS,
});

const sel = (over: Partial<PricingSelections> = {}): PricingSelections => ({
  mealSizeId: "m1",
  frequencyKey: "5_day",
  persons: 1,
  mealSlots: ["lunch"],
  includeSaturday: false,
  includeSunday: false,
  durationWeeks: 1,
  ...over,
});

describe("priceSubscription (per-tiffin)", () => {
  it("counts tiffins as deliveryDays × weeks × persons (slot-agnostic)", () => {
    // 5 days × 4 weeks × 1 person = 20 tiffins → 0% uplift → $10 each
    const r = priceSubscription(sel({ durationWeeks: 4 }), catalog(10));
    expect(r.tiffinCount).toBe(20);
    expect(r.perTiffinPrice).toBe(10);
    expect(r.total).toBe(200);
    expect(r.tier.upliftPct).toBe(0);
    expect(r.adjustments).toEqual([]);
  });

  it("applies the small-volume uplift below 12", () => {
    // 5 days × 1 week = 5 tiffins → 20% uplift → $12 each
    const r = priceSubscription(sel(), catalog(10));
    expect(r.tiffinCount).toBe(5);
    expect(r.perTiffinPrice).toBe(12);
    expect(r.total).toBe(60);
  });

  it("applies the mid-band uplift at 12–19", () => {
    // 3 days × 4 weeks = 12 tiffins → 10% uplift → $11 each
    const r = priceSubscription(sel({ frequencyKey: "mwf", durationWeeks: 4 }), catalog(10, "mwf"));
    expect(r.tiffinCount).toBe(12);
    expect(r.perTiffinPrice).toBe(11);
    expect(r.total).toBe(132);
  });

  it("Saturday and Sunday each add a delivery day", () => {
    // (5 + 1 + 1) days × 4 weeks = 28 tiffins → 0% uplift
    const r = priceSubscription(sel({ includeSaturday: true, includeSunday: true, durationWeeks: 4 }), catalog(10));
    expect(r.tiffinCount).toBe(28);
    expect(r.perTiffinPrice).toBe(10);
    expect(r.total).toBe(280);
  });

  it("is slot-agnostic — extra slots do not change the count", () => {
    const one = priceSubscription(sel({ mealSlots: ["lunch"], durationWeeks: 4 }), catalog(10));
    const three = priceSubscription(sel({ mealSlots: ["breakfast", "lunch", "dinner"], durationWeeks: 4 }), catalog(10));
    expect(three.tiffinCount).toBe(one.tiffinCount);
    expect(three.total).toBe(one.total);
  });

  it("multiplies tiffins by persons", () => {
    // 5 days × 1 week × 4 persons = 20 → 0% uplift
    const r = priceSubscription(sel({ persons: 4 }), catalog(10));
    expect(r.tiffinCount).toBe(20);
    expect(r.total).toBe(200);
  });

  it("returns a single tiffins line item and an empty adjustments array", () => {
    const r = priceSubscription(sel(), catalog(10));
    expect(r.lineItems).toHaveLength(1);
    expect(r.lineItems[0].amount).toBe(r.subtotal);
    expect(r.subtotal).toBe(r.total);
  });

  it("throws when tiers are misconfigured (no match)", () => {
    expect(() => priceSubscription(sel(), { ...catalog(10), tiers: [{ minQty: 100, maxQty: null, upliftPct: 0 }] })).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/pricing/engine.test.ts`
Expected: FAIL — old engine returns `weeklyFee`/`discounts`; new assertions and `tiers` field do not exist.

- [ ] **Step 3: Replace the pricing types**

Replace the contents of `lib/pricing/types.ts`:

```ts
import type { PricingTier } from "./tiers";

export interface PricingSelections {
  mealSizeId: string;
  frequencyKey: "5_day" | "mwf";
  persons: number;
  mealSlots: string[];
  includeSaturday: boolean;
  includeSunday: boolean;
  durationWeeks: number;
}

export interface PricingCatalog {
  mealSize: { id: string; basePrice: number };
  frequency: { key: string; daysPerWeek: number };
  tiers: PricingTier[];
}

export interface PricingLine {
  label: string;
  amount: number;
}

export interface PricingResult {
  lineItems: PricingLine[];
  adjustments: PricingLine[]; // coupon hook — always [] in this slice
  tiffinCount: number;
  perTiffinPrice: number;
  tier: PricingTier;
  subtotal: number;
  total: number;
}
```

- [ ] **Step 4: Rewrite the engine**

Replace the contents of `lib/pricing/engine.ts`:

```ts
import { assertValidTiers, findTier } from "./tiers";
import type { PricingCatalog, PricingLine, PricingResult, PricingSelections } from "./types";

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function priceSubscription(selections: PricingSelections, catalog: PricingCatalog): PricingResult {
  assertValidTiers(catalog.tiers);

  const deliveryDays =
    catalog.frequency.daysPerWeek +
    (selections.includeSaturday ? 1 : 0) +
    (selections.includeSunday ? 1 : 0);

  // Slot-agnostic: one tiffin per delivery day per person, regardless of slot count.
  const tiffinCount = deliveryDays * selections.durationWeeks * selections.persons;

  const tier = findTier(catalog.tiers, tiffinCount);
  const perTiffinPrice = round2(catalog.mealSize.basePrice * (1 + tier.upliftPct / 100));
  const subtotal = round2(perTiffinPrice * tiffinCount);

  const lineItems: PricingLine[] = [
    { label: `Tiffins (${tiffinCount} × $${perTiffinPrice.toFixed(2)})`, amount: subtotal },
  ];

  // Coupon hook: future slice pushes discount lines here; total subtracts their sum.
  const adjustments: PricingLine[] = [];
  const total = round2(subtotal - adjustments.reduce((s, a) => s + a.amount, 0));

  return { lineItems, adjustments, tiffinCount, perTiffinPrice, tier, subtotal, total };
}
```

- [ ] **Step 5: Update the pricing barrel export**

Replace the contents of `lib/pricing/index.ts`:

```ts
export * from "./types";
export * from "./tiers";
export { priceSubscription } from "./engine";
```

- [ ] **Step 6: Update `build-catalog.ts`**

Replace the contents of `lib/pricing/build-catalog.ts`:

```ts
import { ValidationError } from "@tiffin/commons";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import type { PricingCatalog, PricingSelections } from "@/lib/pricing";

export const MIN_PERSONS = 1;
export const MAX_PERSONS = 5;

export function buildPricingCatalog(snapshot: CatalogSnapshot, selections: PricingSelections): PricingCatalog {
  if (!Number.isInteger(selections.persons) || selections.persons < MIN_PERSONS || selections.persons > MAX_PERSONS) {
    throw new ValidationError(`Persons must be an integer ${MIN_PERSONS}–${MAX_PERSONS}`);
  }
  if (!Array.isArray(selections.mealSlots) || selections.mealSlots.length === 0) {
    throw new ValidationError("At least one meal slot is required");
  }

  const mealSize = snapshot.mealSizes.find((m) => m.publicId === selections.mealSizeId);
  if (!mealSize) throw new ValidationError("Invalid meal size");

  const frequency = snapshot.frequencies.find((f) => f.key === selections.frequencyKey);
  if (!frequency) throw new ValidationError("Invalid frequency");

  const durationPackage = snapshot.durations.find((d) => d.weeks === selections.durationWeeks);
  if (!durationPackage) throw new ValidationError("Invalid duration");

  return {
    mealSize: { id: mealSize.publicId, basePrice: mealSize.basePrice },
    frequency: { key: frequency.key, daysPerWeek: frequency.daysPerWeek },
    tiers: snapshot.tiers,
  };
}
```

- [ ] **Step 7: Run the engine + tier tests to verify they pass**

Run: `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/pricing/`
Expected: `engine.test.ts` and `tiers.test.ts` PASS.

- [ ] **Step 8: Commit (app build intentionally still red — consumers updated in Task 4)**

```bash
git add lib/pricing/types.ts lib/pricing/engine.ts lib/pricing/index.ts lib/pricing/build-catalog.ts lib/pricing/engine.test.ts
git commit -m "feat(pricing): rewrite engine to per-tiffin volume-tiered pricing"
```

---

### Task 4: Integrate the new pricing shape across orders, services, and all UI consumers

**Files:**
- Modify: `db/schema/orders.ts` (drop `weeklyFee`, `isStudent`; add `tiffinCount`, `perTiffinPrice`)
- Create: `lib/services/order-slots.ts` (pure `validateOrderSlots`)
- Create: `lib/services/__tests__/order-slots.test.ts`
- Modify: `lib/services/orders.service.ts` (new fields + slot validation)
- Modify: `components/wizard/selections.ts` (drop `isStudent`)
- Modify: `components/wizard/steps/step-schedule.tsx` (remove student checkbox; fix weekend label)
- Modify: `components/wizard/invoice.tsx` (new result shape)
- Modify: `app/(dashboard)/dashboard/inquiries/[id]/order/order-form.tsx` (remove student; new display)
- Modify: `app/(dashboard)/dashboard/page.tsx` (revenue stat: sum `orders.total`)

**Interfaces:**
- Consumes: `PricingResult`, `PricingSelections` (Task 3); `CatalogSnapshot.plans[].planType/offeredSlots` (Task 2).
- Produces: `validateOrderSlots(planType: "tiffin" | "healthy", offeredSlots: string[], chosen: string[]): void` — throws `ValidationError` on an invalid selection.

- [ ] **Step 1: Write the failing slot-validation test**

Create `lib/services/__tests__/order-slots.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateOrderSlots } from "../order-slots";

describe("validateOrderSlots", () => {
  it("accepts a single offered slot for a tiffin plan", () => {
    expect(() => validateOrderSlots("tiffin", ["lunch"], ["lunch"])).not.toThrow();
  });
  it("rejects a tiffin plan with more than one chosen slot", () => {
    expect(() => validateOrderSlots("tiffin", ["lunch"], ["lunch", "dinner"])).toThrow();
  });
  it("accepts a subset of offered slots for a healthy plan", () => {
    expect(() => validateOrderSlots("healthy", ["breakfast", "lunch", "dinner"], ["breakfast", "dinner"])).not.toThrow();
  });
  it("rejects a chosen slot not in offeredSlots", () => {
    expect(() => validateOrderSlots("healthy", ["breakfast", "lunch"], ["dinner"])).toThrow();
  });
  it("rejects an empty selection", () => {
    expect(() => validateOrderSlots("healthy", ["breakfast", "lunch"], [])).toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/services/__tests__/order-slots.test.ts`
Expected: FAIL — `Cannot find module '../order-slots'`.

- [ ] **Step 3: Implement the slot validator**

Create `lib/services/order-slots.ts`:

```ts
import { ValidationError } from "@tiffin/commons";

export function validateOrderSlots(
  planType: "tiffin" | "healthy",
  offeredSlots: string[],
  chosen: string[],
): void {
  if (chosen.length === 0) throw new ValidationError("At least one meal slot is required");
  const offered = new Set(offeredSlots);
  for (const s of chosen) {
    if (!offered.has(s)) throw new ValidationError(`Slot "${s}" is not offered by this plan`);
  }
  if (planType === "tiffin" && chosen.length !== 1) {
    throw new ValidationError("A tiffin plan allows exactly one meal slot");
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run lib/services/__tests__/order-slots.test.ts`
Expected: PASS.

- [ ] **Step 5: Swap the order columns in the schema**

In `db/schema/orders.ts`:
- Remove the `isStudent` line and the `weeklyFee` line.
- Add, after `durationWeeks`:
```ts
  tiffinCount: integer("tiffin_count").notNull(),
  perTiffinPrice: numeric("per_tiffin_price", { precision: 10, scale: 2 }).notNull(),
```
(`integer` and `numeric` are already imported.)

- [ ] **Step 6: Update `orders.service.ts`**

In `lib/services/orders.service.ts`:

Add the import:
```ts
import { validateOrderSlots } from "./order-slots";
```

After the existing `plan` lookup (where `plan` is resolved from `snapshot.plans`), add validation:
```ts
  validateOrderSlots(plan.planType, plan.offeredSlots, input.selections.mealSlots);
```

In the `orders` insert `.values({...})`, remove:
```ts
        isStudent: input.selections.isStudent,
        weeklyFee: pricing.weeklyFee.toFixed(2),
```
and add:
```ts
        tiffinCount: pricing.tiffinCount,
        perTiffinPrice: pricing.perTiffinPrice.toFixed(2),
```
Leave `pricingSnapshot: pricing` and `total: pricing.total.toFixed(2)` and the `payments` `amount: pricing.total.toFixed(2)` as-is.

- [ ] **Step 7: Update the wizard selections default**

In `components/wizard/selections.ts`, remove the `isStudent: false,` line from `initialSelections`. (The `WizardSelections extends PricingSelections` type no longer has `isStudent`.)

- [ ] **Step 8: Update the schedule step**

In `components/wizard/steps/step-schedule.tsx`:
- Remove the entire trailing student `<label>` block (the one with `selections.isStudent`).
- Change the weekend section `<Label>` text from `Weekend add-ons (+$15/wk each)` to `Weekend delivery`, and the two span texts to `Include Saturday` / `Include Sunday` (drop the price text — weekends are now just extra delivery days priced per tiffin).

- [ ] **Step 9: Update the invoice**

Replace the contents of `components/wizard/invoice.tsx`:

```tsx
import type { PricingResult } from "@/lib/pricing";
import { Separator } from "@/components/ui/separator";

export function Invoice({ result }: { result: PricingResult | null }) {
  if (!result) return <p className="text-sm text-muted-foreground">Select a meal to see pricing.</p>;
  return (
    <div className="rounded-lg border p-4 text-sm">
      <ul className="space-y-1">
        {result.lineItems.map((li) => (
          <li key={li.label} className="flex justify-between">
            <span>{li.label}</span><span>${li.amount.toFixed(2)}</span>
          </li>
        ))}
        {result.adjustments.map((d) => (
          <li key={d.label} className="flex justify-between text-emerald-600">
            <span>{d.label}</span><span>−${d.amount.toFixed(2)}</span>
          </li>
        ))}
      </ul>
      <Separator className="my-3" />
      <div className="flex justify-between text-muted-foreground">
        <span>{result.tiffinCount} tiffins × ${result.perTiffinPrice.toFixed(2)}</span><span>${result.subtotal.toFixed(2)}</span>
      </div>
      <div className="flex justify-between text-base font-semibold">
        <span>Total</span><span>${result.total.toFixed(2)}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Update the agent order form**

In `app/(dashboard)/dashboard/inquiries/[id]/order/order-form.tsx`:
- Remove the `const [isStudent, setStudent] = useState(false);` line.
- In the `selections: { ... }` object literal, remove `isStudent,`.
- In the dependency array of the `useEffect`/`useMemo`, remove `isStudent`.
- Remove the Student `<label>...<Switch checked={isStudent} .../> Student</label>` control.
- Change the weekly total line from:
```tsx
<div className="mt-2 flex justify-between border-t pt-2 font-medium"><span>Weekly</span><span>${preview.weeklyFee.toFixed(2)}</span></div>
```
to:
```tsx
<div className="mt-2 flex justify-between border-t pt-2 font-medium"><span>Total ({preview.tiffinCount} tiffins)</span><span>${preview.total.toFixed(2)}</span></div>
```

- [ ] **Step 11: Update the dashboard revenue stat**

In `app/(dashboard)/dashboard/page.tsx`, change the revenue aggregate from `sum(${orders.weeklyFee})` to `sum(${orders.total})`:
```ts
      .select({ total: sql<string>`coalesce(sum(${orders.total}), 0)` })
```
Change the stat label from `Weekly revenue` to `Revenue` and the hint from `from active plans` to `active plans`.

- [ ] **Step 12: Generate + apply the orders migration, reseed**

Run:
```bash
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:generate
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:migrate
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:seed && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:seed:catalog && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:seed:menu && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:seed:admin
```
Expected: orders migration applied (drops `weekly_fee`/`is_student`, adds `tiffin_count`/`per_tiffin_price`); seeds succeed.

- [ ] **Step 13: Full green gate**

Run:
```bash
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm test
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm typecheck
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm build
```
Expected: all PASS. Reseed after tests (they wipe the DB):
```bash
DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:seed && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:seed:catalog && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:seed:menu && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:seed:admin
```

- [ ] **Step 14: Commit**

```bash
git add db/schema/orders.ts lib/services/order-slots.ts lib/services/__tests__/order-slots.test.ts lib/services/orders.service.ts components/wizard/selections.ts components/wizard/steps/step-schedule.tsx components/wizard/invoice.tsx "app/(dashboard)/dashboard/inquiries/[id]/order/order-form.tsx" "app/(dashboard)/dashboard/page.tsx" db/migrations
git commit -m "feat(pricing): integrate per-tiffin pricing across orders, wizard, agent form, dashboard"
```

---

## Self-Review

**Spec coverage:**
- Schema: `plans.planType`/`offeredSlots` → Task 2; `pricingTiers` → Task 1; `orders` column swap → Task 4. ✓
- Pricing engine rewrite (per-tiffin, tier uplift, slot-agnostic, `adjustments` hook, throw on no match) → Task 3. ✓
- Deprecations (courier/duration discounts unread) → engine + build-catalog stop reading them (Task 3); columns left in place. ✓
- Plan-type behavior (mealSlots ⊆ offeredSlots, tiffin single slot) → Task 4 `validateOrderSlots`. ✓
- Admin UI (plans type/slots + pricing tiers editor) → Task 1 + Task 2 via the config-driven editor. ✓
- Wire-up for green build (checkout/order paths + all consumers) → Task 4. ✓
- Migration + seed (tiers + plan types, reseed) → Tasks 1, 2, 4. ✓
- Tests (tier boundaries, Sat/Sun, persons, weeks, slot-agnostic, no-match, slot validation, tier validation) → Tasks 1, 3, 4. ✓
- Coupon hook (`adjustments` in `PricingResult`) → Task 3. ✓

**Placeholder scan:** No TBD/TODO; every code step has concrete code. The one conditional note (seed `breakfast`/`dinner` slots in `db/seed-menu.ts`) is explicitly scoped as non-blocking for pricing and required only for later slices.

**Type consistency:** `PricingTier` defined in Task 1, imported in Tasks 2–4. `PricingSelections`/`PricingResult`/`PricingCatalog` defined in Task 3, consumed in Task 4. `validateOrderSlots` signature defined in Task 4 Step 3 matches its call in Step 6. Field names (`tiffinCount`, `perTiffinPrice`, `subtotal`, `adjustments`) consistent across engine, invoice, order form, and orders.service.

## Out of scope (later slices)
Customer self-serve subscribe UX polish (slice 2), per-day meal-selection form + rolling cutoff (slice 3), agent CRM subscription management (slice 4), coupons (own slice — `adjustments` hook ready), catering, removing deprecated discount columns.
