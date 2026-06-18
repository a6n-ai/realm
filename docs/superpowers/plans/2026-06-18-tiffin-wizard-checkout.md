# Tiffin Grab — Subscription Wizard + Checkout + Activation (Subsystem C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the public 4-step subscription wizard → 2-step checkout → activation flow, backed by a seeded catalog, an immutable orders schema, and a pure server-side pricing engine that is the single source of truth for money.

**Architecture:** Build on Plan 1 (foundation: `@tiffin/commons`, `@tiffin/commons-drizzle`, `@tiffin/commons-next`, Drizzle client) and Plan 2 (auth/RBAC: `users` table, `auth()` session, `bcryptjs`). Catalog + orders are Drizzle tables using the base-column tiers. A pure `priceSubscription()` function prices both the live wizard preview and the authoritative checkout recompute via Server Actions — the client never submits totals. UI uses shadcn (Nova) components; `impeccable` governs polish.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript 5, Drizzle ORM 0.45 + drizzle-kit 0.31, `postgres` 3.4, Vitest 4.1, shadcn/ui (Nova), bcryptjs (from Plan 2).

## Global Constraints

- Next.js 16 App Router. Route protection lives in `proxy.ts` (NOT `middleware.ts`). Do not add a `middleware.ts`.
- Read `node_modules/next/dist/docs/` before writing any framework-specific code (per `AGENTS.md`).
- TypeScript everywhere. No unnecessary comments — document the non-obvious *why* only.
- Use `rg`/`fd` over `grep`/`find` in any tooling.
- Every table uses `baseColumns` (immutable) or `updatableColumns` (updatable) from `@tiffin/commons-drizzle`. PKs are uuid v4.
- **Pricing is computed server-side only.** The client never submits prices/totals; the checkout recomputes authoritatively from catalog ids before persisting.
- Reuse `@tiffin/commons` (`generateCode`, errors), `@tiffin/commons-drizzle` (repo/service/columns), and `@tiffin/commons-next` (route factory) — do not re-implement them.
- Pin `next@16.2.9`, `drizzle-orm@^0.45.2`.
- The brief's intro said "3 steps"; its detailed breakdown is **4 wizard steps + 2 checkout steps + activation**. This plan implements the detailed **4 + 2** flow.
- Mixed plan (`veg & non-veg`) stores only the baseline config; per-day dish picking is deferred to subsystem E.

## Assumptions (stated, not silent)

- **`basePrice` values** are placeholders (real pricing is admin-editable in subsystem D):
  Small Thali $9.99, Sabzi Only $8.49, 4-Item Regular $11.99, 4-Item Large $13.99,
  5-Item Regular $13.49, New Thali $12.49, 5-Item Large $16.99, Maharaja Thali $19.99.
- **Discount order** (per spec §5): courier (MWF, on the weekday meal subtotal only) →
  student (10%, on the running subtotal) → duration (0–15%, on the running subtotal),
  applied **sequentially** to the weekly subtotal. `total = weeklyFee × durationWeeks`.
  Amounts round to 2 decimals at each discount and for `weeklyFee`/`total`.
- **GTA postal prefixes** are representative FSA prefixes (first 1–2 chars), good enough for
  a demo zone match; overlaps resolve first-match-wins.
- **Wizard→checkout handoff** carries the *selections* (ids/flags, never prices) via
  `sessionStorage`; checkout recomputes server-side from those ids.

---

### Task 1: Catalog schema + migration

**Files:**
- Create: `apps/web/db/schema/catalog.ts`
- Modify: `apps/web/db/schema/index.ts` (add `export * from "./catalog"`)

**Interfaces:**
- Consumes: `updatableColumns` from `@tiffin/commons-drizzle`.
- Produces tables `plans`, `mealSizes`, `addons`, `deliveryFrequencies`, `durationPackages`, `deliveryZones`, plus pgEnums `mealTier`, `mealDiet`.

- [ ] **Step 1: Write the catalog schema**

`apps/web/db/schema/catalog.ts`:
```ts
import { updatableColumns } from "@tiffin/commons-drizzle";
import { boolean, integer, jsonb, numeric, pgEnum, pgTable, text } from "drizzle-orm/pg-core";

export const mealTier = pgEnum("meal_tier", ["budget", "medium", "premium"]);
export const mealDiet = pgEnum("meal_diet", ["veg", "nonveg", "both"]);

export const plans = pgTable("plans", {
  ...updatableColumns,
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
});

export const mealSizes = pgTable("meal_sizes", {
  ...updatableColumns,
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  tier: mealTier("tier").notNull(),
  diet: mealDiet("diet").notNull(),
  components: jsonb("components").$type<string[]>().notNull().default([]),
  kcalMin: integer("kcal_min").notNull(),
  kcalMax: integer("kcal_max").notNull(),
  proteinG: integer("protein_g"),
  carbsG: integer("carbs_g"),
  fatG: integer("fat_g"),
  basePrice: numeric("base_price", { precision: 10, scale: 2 }).notNull(),
});

export const addons = pgTable("addons", {
  ...updatableColumns,
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  pricePerWeek: numeric("price_per_week", { precision: 10, scale: 2 }).notNull(),
});

export const deliveryFrequencies = pgTable("delivery_frequencies", {
  ...updatableColumns,
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  daysPerWeek: integer("days_per_week").notNull(),
  courierDiscountPct: integer("courier_discount_pct").notNull().default(0),
});

export const durationPackages = pgTable("duration_packages", {
  ...updatableColumns,
  weeks: integer("weeks").notNull().unique(),
  discountPct: integer("discount_pct").notNull().default(0),
});

export const deliveryZones = pgTable("delivery_zones", {
  ...updatableColumns,
  name: text("name").notNull(),
  postalPrefixes: text("postal_prefixes").array().notNull(),
  slotWindow: text("slot_window").notNull(),
  active: boolean("active").notNull().default(true),
});
```

- [ ] **Step 2: Re-export from the schema barrel**

Edit `apps/web/db/schema/index.ts` to add:
```ts
export * from "./catalog";
```

- [ ] **Step 3: Generate and apply the migration**

Run:
```bash
cd apps/web
pnpm exec drizzle-kit generate
pnpm exec drizzle-kit migrate
cd ../..
```
Expected: a new migration under `apps/web/db/migrations/` creating the 6 catalog tables + 2 enums; `migrate` reports applied.

- [ ] **Step 4: Commit**

```bash
git add apps/web/db/schema/catalog.ts apps/web/db/schema/index.ts apps/web/db/migrations
git commit -m "feat(catalog): plans, meal_sizes, addons, frequencies, durations, zones schema"
```

---

### Task 2: Seed the catalog (idempotent)

**Files:**
- Create: `apps/web/db/seed-catalog.ts`
- Modify: `apps/web/package.json` (add `"db:seed:catalog": "tsx db/seed-catalog.ts"`)

**Interfaces:**
- Consumes: `db` (`apps/web/db/client.ts`), catalog tables.
- Produces: deterministic catalog rows; re-running is a no-op (`onConflictDoNothing`).

- [ ] **Step 1: Write the catalog seed**

`apps/web/db/seed-catalog.ts`:
```ts
import { db } from "./client";
import { addons, deliveryFrequencies, deliveryZones, durationPackages, mealSizes, plans } from "./schema";

const PLANS = [
  { key: "veg", name: "Pure Vegetarian Plan", description: "Seasonal vegetables, paneer, daal, rotis, raitas." },
  { key: "halal_nonveg", name: "Halal Non-Veg Plan", description: "Poultry, mutton, egg masalas, daals, chapatis." },
  { key: "mixed", name: "Veg & Non-Veg Mixed Plan", description: "Alternating vegetarian and non-vegetarian days." },
];

const MEAL_SIZES = [
  { key: "small_thali", name: "Small Thali", tier: "budget", diet: "veg", components: ["12oz Sabzi", "12oz Rice", "2 Rotis"], kcalMin: 550, kcalMax: 650, proteinG: 18, carbsG: 90, fatG: 16, basePrice: "9.99" },
  { key: "sabzi_only", name: "Sabzi Only", tier: "budget", diet: "veg", components: ["2x 8oz Sabzi", "8oz Daal"], kcalMin: 400, kcalMax: 550, proteinG: 20, carbsG: 45, fatG: 18, basePrice: "8.49" },
  { key: "four_item_regular", name: "4-Item Thali (Regular)", tier: "medium", diet: "both", components: ["8oz Sabzi", "8oz Daal", "12oz Rice", "2 Rotis"], kcalMin: 750, kcalMax: 850, proteinG: 28, carbsG: 110, fatG: 22, basePrice: "11.99" },
  { key: "four_item_large", name: "4-Item Thali (Large)", tier: "medium", diet: "both", components: ["12oz Sabzi", "12oz Daal", "12oz Rice", "4 Rotis"], kcalMin: 950, kcalMax: 1100, proteinG: 36, carbsG: 140, fatG: 28, basePrice: "13.99" },
  { key: "five_item_regular", name: "5-Item Thali (Regular)", tier: "medium", diet: "both", components: ["8oz Sabzi", "8oz Daal", "12oz Rice", "3 Rotis", "8oz Raita/Salad"], kcalMin: 850, kcalMax: 1000, proteinG: 32, carbsG: 125, fatG: 26, basePrice: "13.49" },
  { key: "new_thali", name: "New Thali", tier: "medium", diet: "both", components: ["8oz Sabzi", "8oz Daal", "8 Rotis"], kcalMin: 900, kcalMax: 1100, proteinG: 34, carbsG: 130, fatG: 24, basePrice: "12.49" },
  { key: "five_item_large", name: "5-Item Thali (Large)", tier: "premium", diet: "both", components: ["12oz Sabzi", "12oz Daal", "12oz Rice", "6 Rotis", "Salad", "Raita"], kcalMin: 1200, kcalMax: 1450, proteinG: 44, carbsG: 165, fatG: 34, basePrice: "16.99" },
  { key: "maharaja_thali", name: "Maharaja Thali", tier: "premium", diet: "both", components: ["12oz Sabzi", "12oz Daal", "8oz Sabzi", "12oz Rice", "8 Rotis", "Salad", "Raita"], kcalMin: 1500, kcalMax: 1750, proteinG: 52, carbsG: 190, fatG: 40, basePrice: "19.99" },
] as const;

const ADDONS = [
  { key: "saturday", name: "Saturday Special (Biryanis & Pulaos)", pricePerWeek: "15.00" },
  { key: "sunday", name: "Sunday Classics (Curries & Parathas)", pricePerWeek: "15.00" },
];

const FREQUENCIES = [
  { key: "5_day", name: "5 Days/Wk (Mon–Fri)", daysPerWeek: 5, courierDiscountPct: 0 },
  { key: "mwf", name: "3 Days/Wk Alternate (MWF)", daysPerWeek: 3, courierDiscountPct: 10 },
];

const DURATIONS = [
  { weeks: 1, discountPct: 0 },
  { weeks: 2, discountPct: 2 },
  { weeks: 4, discountPct: 5 },
  { weeks: 8, discountPct: 10 },
  { weeks: 12, discountPct: 15 },
];

const ZONES = [
  { name: "Etobicoke", postalPrefixes: ["M8", "M9"], slotWindow: "9:00 AM – 12:00 PM" },
  { name: "Mississauga", postalPrefixes: ["L5"], slotWindow: "10:00 AM – 1:00 PM" },
  { name: "Brampton", postalPrefixes: ["L6P", "L6R", "L6S", "L6T", "L6V", "L6W", "L6X", "L6Y", "L6Z", "L7A"], slotWindow: "11:00 AM – 2:00 PM" },
  { name: "Toronto", postalPrefixes: ["M4", "M5", "M6"], slotWindow: "10:00 AM – 1:00 PM" },
  { name: "Scarborough", postalPrefixes: ["M1"], slotWindow: "12:00 PM – 3:00 PM" },
  { name: "Markham", postalPrefixes: ["L3R", "L3S", "L3P", "L6B", "L6C", "L6E", "L6G"], slotWindow: "11:00 AM – 2:00 PM" },
  { name: "Richmond Hill", postalPrefixes: ["L4B", "L4C", "L4E", "L4S"], slotWindow: "11:00 AM – 2:00 PM" },
  { name: "North York", postalPrefixes: ["M2", "M3"], slotWindow: "10:00 AM – 1:00 PM" },
  { name: "Vaughan", postalPrefixes: ["L4H", "L4J", "L4K", "L4L", "L6A"], slotWindow: "11:00 AM – 2:00 PM" },
  { name: "Oakville", postalPrefixes: ["L6H", "L6J", "L6K", "L6L", "L6M"], slotWindow: "12:00 PM – 3:00 PM" },
  { name: "East York", postalPrefixes: ["M4B", "M4C", "M4G", "M4H", "M4J", "M4K"], slotWindow: "10:00 AM – 1:00 PM" },
];

async function main() {
  for (const p of PLANS) await db.insert(plans).values(p).onConflictDoNothing({ target: plans.key });
  for (const m of MEAL_SIZES) await db.insert(mealSizes).values(m).onConflictDoNothing({ target: mealSizes.key });
  for (const a of ADDONS) await db.insert(addons).values(a).onConflictDoNothing({ target: addons.key });
  for (const f of FREQUENCIES) await db.insert(deliveryFrequencies).values(f).onConflictDoNothing({ target: deliveryFrequencies.key });
  for (const d of DURATIONS) await db.insert(durationPackages).values(d).onConflictDoNothing({ target: durationPackages.weeks });
  for (const z of ZONES) await db.insert(deliveryZones).values(z).onConflictDoNothing();
  console.log(`Seeded catalog: ${PLANS.length} plans, ${MEAL_SIZES.length} meal sizes, ${ADDONS.length} addons, ${FREQUENCIES.length} frequencies, ${DURATIONS.length} durations, ${ZONES.length} zones`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Add the script and run the seed twice (idempotency check)**

Add to `apps/web/package.json` scripts: `"db:seed:catalog": "tsx db/seed-catalog.ts"`. Run:
```bash
pnpm --filter web db:seed:catalog
pnpm --filter web db:seed:catalog
```
Expected: both runs print the summary line; the second inserts nothing new (no duplicate-key error). Confirm row counts:
```bash
docker compose exec -T db psql -U tiffin -d tiffin -c "select count(*) from meal_sizes;"
```
Expected: `8`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/db/seed-catalog.ts apps/web/package.json
git commit -m "feat(catalog): idempotent catalog seed (meals, addons, frequencies, durations, zones)"
```

---

### Task 3: Orders schema — `subscriptions` + `payments` + migration

**Files:**
- Create: `apps/web/db/schema/orders.ts`
- Modify: `apps/web/db/schema/index.ts` (add `export * from "./orders"`)

**Interfaces:**
- Consumes: `updatableColumns`, `baseColumns` from `@tiffin/commons-drizzle`; `users` (Plan 2), catalog tables (Task 1).
- Produces: `subscriptions` (updatable), `payments` (immutable), pgEnums `subscriptionStatus`, `paymentStatus`.

- [ ] **Step 1: Write the orders schema**

`apps/web/db/schema/orders.ts`:
```ts
import { baseColumns, updatableColumns } from "@tiffin/commons-drizzle";
import { boolean, integer, jsonb, numeric, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { deliveryFrequencies, deliveryZones, mealSizes, plans } from "./catalog";
import { users } from "./auth";

export const subscriptionStatus = pgEnum("subscription_status", ["pending", "active", "waitlisted", "cancelled"]);
export const paymentStatus = pgEnum("payment_status", ["simulated_paid"]);

export const subscriptions = pgTable("subscriptions", {
  ...updatableColumns,
  userId: uuid("user_id").references(() => users.id),
  planId: uuid("plan_id").notNull().references(() => plans.id),
  mealSizeId: uuid("meal_size_id").notNull().references(() => mealSizes.id),
  frequencyId: uuid("frequency_id").notNull().references(() => deliveryFrequencies.id),
  dailyQty: integer("daily_qty").notNull().default(1),
  includeSaturday: boolean("include_saturday").notNull().default(false),
  includeSunday: boolean("include_sunday").notNull().default(false),
  isStudent: boolean("is_student").notNull().default(false),
  durationWeeks: integer("duration_weeks").notNull(),
  pricingSnapshot: jsonb("pricing_snapshot").notNull(),
  weeklyFee: numeric("weekly_fee", { precision: 10, scale: 2 }).notNull(),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  status: subscriptionStatus("status").notNull().default("pending"),
  deploymentId: text("deployment_id").notNull().unique(),
  zoneId: uuid("zone_id").references(() => deliveryZones.id),
  fullName: text("full_name").notNull(),
  addressLine: text("address_line").notNull(),
  city: text("city").notNull(),
  postalCode: text("postal_code").notNull(),
});

export const payments = pgTable("payments", {
  ...baseColumns,
  subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id),
  status: paymentStatus("status").notNull().default("simulated_paid"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
});
```

> Depends on Plan 2's `apps/web/db/schema/auth.ts` exporting `users` (re-exported via the `@/db/schema` barrel). If executing C before B, create a minimal `users` table first (uuid id + email) — but the canonical order is B → C.

- [ ] **Step 2: Re-export and migrate**

Edit `apps/web/db/schema/index.ts` to add `export * from "./orders";`. Run:
```bash
cd apps/web && pnpm exec drizzle-kit generate && pnpm exec drizzle-kit migrate && cd ../..
```
Expected: migration creating `subscriptions` + `payments` + 2 enums; applied cleanly.

- [ ] **Step 3: Commit**

```bash
git add apps/web/db/schema/orders.ts apps/web/db/schema/index.ts apps/web/db/migrations
git commit -m "feat(orders): subscriptions (updatable) + payments (immutable) schema"
```

---

### Task 4: Pricing engine (pure) + thorough Vitest

**Files:**
- Create: `apps/web/lib/pricing/types.ts`, `apps/web/lib/pricing/engine.ts`, `apps/web/lib/pricing/index.ts`
- Test: `apps/web/lib/pricing/engine.test.ts`

**Interfaces:**
- Produces:
  - `PricingSelections = { mealSizeId, frequencyKey: "5_day"|"mwf", dailyQty, includeSaturday, includeSunday, isStudent, durationWeeks }`
  - `PricingCatalog = { mealSize: { id; basePrice: number }, frequency: { key; daysPerWeek; courierDiscountPct }, addons: { saturday: number; sunday: number }, durationPackage: { weeks; discountPct } }`
  - `PricingResult = { lineItems: {label;amount}[]; discounts: {label;amount}[]; weeklyFee: number; durationWeeks: number; total: number }`
  - `priceSubscription(selections: PricingSelections, catalog: PricingCatalog): PricingResult`
  - constant `STUDENT_DISCOUNT_PCT = 10`

- [ ] **Step 1: Write the failing tests**

`apps/web/lib/pricing/engine.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { priceSubscription } from "./engine";
import type { PricingCatalog, PricingSelections } from "./types";

const baseCatalog = (basePrice = 10, freqKey: "5_day" | "mwf" = "5_day", durationPct = 0, weeks = 1): PricingCatalog => ({
  mealSize: { id: "m1", basePrice },
  frequency: freqKey === "5_day"
    ? { key: "5_day", daysPerWeek: 5, courierDiscountPct: 0 }
    : { key: "mwf", daysPerWeek: 3, courierDiscountPct: 10 },
  addons: { saturday: 15, sunday: 15 },
  durationPackage: { weeks, discountPct: durationPct },
});

const sel = (over: Partial<PricingSelections> = {}): PricingSelections => ({
  mealSizeId: "m1",
  frequencyKey: "5_day",
  dailyQty: 1,
  includeSaturday: false,
  includeSunday: false,
  isStudent: false,
  durationWeeks: 1,
  ...over,
});

describe("priceSubscription", () => {
  it("base meal × dailyQty × billable days (5-day)", () => {
    const r = priceSubscription(sel(), baseCatalog(10));
    expect(r.weeklyFee).toBe(50);
    expect(r.total).toBe(50);
  });

  it("daily quantity multiplier", () => {
    const r = priceSubscription(sel({ dailyQty: 3 }), baseCatalog(10));
    expect(r.weeklyFee).toBe(150);
  });

  it("MWF applies 10% courier discount to the meal subtotal only", () => {
    const r = priceSubscription(sel({ frequencyKey: "mwf" }), baseCatalog(10, "mwf"));
    // meals = 10 × 3 × 1 = 30; courier = 3; weeklyFee = 27
    expect(r.discounts).toContainEqual({ label: "Courier discount (MWF)", amount: 3 });
    expect(r.weeklyFee).toBe(27);
  });

  it("weekend add-ons add $15 each and are exempt from courier discount", () => {
    const r = priceSubscription(sel({ frequencyKey: "mwf", includeSaturday: true, includeSunday: true }), baseCatalog(10, "mwf"));
    // meals 30, courier 3 -> 27; addons 30 -> weeklyFee 57
    expect(r.lineItems).toContainEqual({ label: "Saturday Special", amount: 15 });
    expect(r.lineItems).toContainEqual({ label: "Sunday Classics", amount: 15 });
    expect(r.weeklyFee).toBe(57);
  });

  it("student discount is 10% of the running subtotal", () => {
    const r = priceSubscription(sel({ isStudent: true }), baseCatalog(10));
    // gross 50, student 5, weeklyFee 45
    expect(r.discounts).toContainEqual({ label: "Student discount", amount: 5 });
    expect(r.weeklyFee).toBe(45);
  });

  it("stacks courier → student → duration sequentially", () => {
    const r = priceSubscription(sel({ frequencyKey: "mwf", isStudent: true, durationWeeks: 4 }), baseCatalog(10, "mwf", 5, 4));
    // meals 30; courier 3 -> 27; student 2.7 -> 24.3; duration 5% = 1.22 -> weeklyFee 23.08; total ×4 = 92.32
    expect(r.weeklyFee).toBe(23.08);
    expect(r.total).toBe(92.32);
  });

  it.each([
    [1, 0, 100, 100],
    [2, 2, 98, 196],
    [4, 5, 95, 380],
    [8, 10, 90, 720],
    [12, 15, 85, 1020],
  ])("duration tier %iwk → %i%% gives weeklyFee %i / total %i", (weeks, pct, weekly, total) => {
    // basePrice 20 × 5 days = 100 subtotal, no courier/student
    const r = priceSubscription(sel({ durationWeeks: weeks }), baseCatalog(20, "5_day", pct, weeks));
    expect(r.weeklyFee).toBe(weekly);
    expect(r.total).toBe(total);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter web exec vitest run lib/pricing/engine.test.ts`
Expected: FAIL — `./engine` not found.

- [ ] **Step 3: Implement types and engine**

`apps/web/lib/pricing/types.ts`:
```ts
export interface PricingSelections {
  mealSizeId: string;
  frequencyKey: "5_day" | "mwf";
  dailyQty: number;
  includeSaturday: boolean;
  includeSunday: boolean;
  isStudent: boolean;
  durationWeeks: number;
}

export interface PricingCatalog {
  mealSize: { id: string; basePrice: number };
  frequency: { key: string; daysPerWeek: number; courierDiscountPct: number };
  addons: { saturday: number; sunday: number };
  durationPackage: { weeks: number; discountPct: number };
}

export interface PricingLine {
  label: string;
  amount: number;
}

export interface PricingResult {
  lineItems: PricingLine[];
  discounts: PricingLine[];
  weeklyFee: number;
  durationWeeks: number;
  total: number;
}
```

`apps/web/lib/pricing/engine.ts`:
```ts
import type { PricingCatalog, PricingLine, PricingResult, PricingSelections } from "./types";

export const STUDENT_DISCOUNT_PCT = 10;

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function priceSubscription(selections: PricingSelections, catalog: PricingCatalog): PricingResult {
  const lineItems: PricingLine[] = [];
  const discounts: PricingLine[] = [];

  const mealsSubtotal = round2(catalog.mealSize.basePrice * catalog.frequency.daysPerWeek * selections.dailyQty);
  lineItems.push({
    label: `Meals (${catalog.frequency.daysPerWeek}×${selections.dailyQty}/wk)`,
    amount: mealsSubtotal,
  });

  if (selections.includeSaturday) lineItems.push({ label: "Saturday Special", amount: round2(catalog.addons.saturday) });
  if (selections.includeSunday) lineItems.push({ label: "Sunday Classics", amount: round2(catalog.addons.sunday) });

  const addonsSubtotal =
    (selections.includeSaturday ? catalog.addons.saturday : 0) +
    (selections.includeSunday ? catalog.addons.sunday : 0);

  // Courier discount applies to the weekday meal subtotal only (not weekend add-ons).
  const courierDiscount = round2(mealsSubtotal * (catalog.frequency.courierDiscountPct / 100));
  if (courierDiscount > 0) discounts.push({ label: "Courier discount (MWF)", amount: courierDiscount });

  let running = round2(mealsSubtotal + addonsSubtotal - courierDiscount);

  const studentPct = selections.isStudent ? STUDENT_DISCOUNT_PCT : 0;
  const studentDiscount = round2(running * (studentPct / 100));
  if (studentDiscount > 0) discounts.push({ label: "Student discount", amount: studentDiscount });
  running = round2(running - studentDiscount);

  const durationPct = catalog.durationPackage.discountPct;
  const durationDiscount = round2(running * (durationPct / 100));
  if (durationDiscount > 0) discounts.push({ label: `Loyalty discount (${durationPct}%)`, amount: durationDiscount });

  const weeklyFee = round2(running - durationDiscount);
  const total = round2(weeklyFee * selections.durationWeeks);

  return { lineItems, discounts, weeklyFee, durationWeeks: selections.durationWeeks, total };
}
```

`apps/web/lib/pricing/index.ts`:
```ts
export * from "./types";
export { STUDENT_DISCOUNT_PCT, priceSubscription } from "./engine";
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter web exec vitest run lib/pricing/engine.test.ts`
Expected: PASS (all cases, including the parametrized duration tiers).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/pricing
git commit -m "feat(pricing): pure server-side pricing engine + thorough unit tests"
```

---

### Task 5: Postal-zone matching util + Vitest

**Files:**
- Create: `apps/web/lib/catalog/postal.ts`
- Test: `apps/web/lib/catalog/postal.test.ts`

**Interfaces:**
- Produces:
  - `ZoneLike = { name: string; postalPrefixes: string[]; slotWindow: string; active: boolean }`
  - `matchZone(postalCode: string, zones: ZoneLike[]): ZoneLike | null` — matches on the FSA (first 3 chars), longest-prefix-first, active zones only.

- [ ] **Step 1: Write the failing test**

`apps/web/lib/catalog/postal.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { matchZone, type ZoneLike } from "./postal";

const zones: ZoneLike[] = [
  { name: "Etobicoke", postalPrefixes: ["M8", "M9"], slotWindow: "9–12", active: true },
  { name: "Mississauga", postalPrefixes: ["L5"], slotWindow: "10–1", active: true },
  { name: "Markham", postalPrefixes: ["L3R"], slotWindow: "11–2", active: true },
  { name: "Inactive", postalPrefixes: ["X1"], slotWindow: "n/a", active: false },
];

describe("matchZone", () => {
  it("matches a served FSA prefix (Etobicoke M9V)", () => {
    expect(matchZone("M9V 1A1", zones)?.name).toBe("Etobicoke");
  });
  it("normalizes case and spacing", () => {
    expect(matchZone("l5b2c3", zones)?.name).toBe("Mississauga");
  });
  it("prefers a longer/more-specific prefix (L3R over a bare L3)", () => {
    expect(matchZone("L3R 9K1", zones)?.name).toBe("Markham");
  });
  it("returns null for a non-served region (Ottawa K1A)", () => {
    expect(matchZone("K1A 0B1", zones)).toBeNull();
  });
  it("ignores inactive zones", () => {
    expect(matchZone("X1Y 2Z3", zones)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter web exec vitest run lib/catalog/postal.test.ts`
Expected: FAIL — `./postal` not found.

- [ ] **Step 3: Implement the matcher**

`apps/web/lib/catalog/postal.ts`:
```ts
export interface ZoneLike {
  name: string;
  postalPrefixes: string[];
  slotWindow: string;
  active: boolean;
}

export function matchZone(postalCode: string, zones: ZoneLike[]): ZoneLike | null {
  const fsa = postalCode.replace(/\s+/g, "").toUpperCase().slice(0, 3);
  if (!fsa) return null;

  let best: { zone: ZoneLike; len: number } | null = null;
  for (const zone of zones) {
    if (!zone.active) continue;
    for (const prefix of zone.postalPrefixes) {
      const p = prefix.toUpperCase();
      if (fsa.startsWith(p) && (!best || p.length > best.len)) {
        best = { zone, len: p.length };
      }
    }
  }
  return best?.zone ?? null;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter web exec vitest run lib/catalog/postal.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/catalog/postal.ts apps/web/lib/catalog/postal.test.ts
git commit -m "feat(catalog): postal-zone FSA matcher (served vs waitlist) + tests"
```

---

### Task 6: Catalog loader, repricing server action, and read-only catalog REST

**Files:**
- Create: `apps/web/lib/catalog/load.ts`
- Create: `apps/web/lib/catalog/types.ts`
- Create: `apps/web/lib/pricing/build-catalog.ts`
- Create: `apps/web/app/(public)/subscribe/actions.ts`
- Create: `apps/web/lib/services/catalog.service.ts`, `apps/web/app/api/meal-sizes/route.ts`, `apps/web/app/api/meal-sizes/query/route.ts`

**Interfaces:**
- Consumes: `db`, catalog tables, `priceSubscription`, `PricingSelections`, `matchZone`; `UpdatableRepository`/`UpdatableService` + `createCollectionRoute`/`createQueryRoute`.
- Produces:
  - `loadCatalogSnapshot()` → `CatalogSnapshot` (all rows; numerics coerced to `number`).
  - `buildPricingCatalog(snapshot, selections)` → `PricingCatalog` (a **plain sync helper** in `lib/pricing/build-catalog.ts`, NOT a server action — `"use server"` modules may only export async functions; looks up the chosen meal size, frequency, duration; null-checks throw `ValidationError`).
  - server action `reprice(selections)` → `PricingResult`.
  - server action `validatePostal(postalCode)` → `{ served: boolean; zone?: { id; name; slotWindow } }`.
  - `GET /api/meal-sizes`, `POST /api/meal-sizes/query` (read+create via the factory; used by dashboards/subsystem D).

- [ ] **Step 1: Catalog types + loader (coerce numerics)**

`apps/web/lib/catalog/types.ts`:
```ts
export interface MealSizeView {
  id: string;
  key: string;
  name: string;
  tier: "budget" | "medium" | "premium";
  diet: "veg" | "nonveg" | "both";
  components: string[];
  kcalMin: number;
  kcalMax: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  basePrice: number;
}

export interface CatalogSnapshot {
  plans: { id: string; key: string; name: string; description: string | null }[];
  mealSizes: MealSizeView[];
  addons: { key: string; name: string; pricePerWeek: number }[];
  frequencies: { id: string; key: string; name: string; daysPerWeek: number; courierDiscountPct: number }[];
  durations: { id: string; weeks: number; discountPct: number }[];
  zones: { id: string; name: string; postalPrefixes: string[]; slotWindow: string; active: boolean }[];
}
```

`apps/web/lib/catalog/load.ts`:
```ts
import { db } from "@/db/client";
import { addons, deliveryFrequencies, deliveryZones, durationPackages, mealSizes, plans } from "@/db/schema";
import type { CatalogSnapshot } from "./types";

export async function loadCatalogSnapshot(): Promise<CatalogSnapshot> {
  const [planRows, mealRows, addonRows, freqRows, durRows, zoneRows] = await Promise.all([
    db.select().from(plans),
    db.select().from(mealSizes),
    db.select().from(addons),
    db.select().from(deliveryFrequencies),
    db.select().from(durationPackages),
    db.select().from(deliveryZones),
  ]);

  return {
    plans: planRows.map((p) => ({ id: p.id, key: p.key, name: p.name, description: p.description })),
    mealSizes: mealRows.map((m) => ({
      id: m.id, key: m.key, name: m.name, tier: m.tier, diet: m.diet, components: m.components,
      kcalMin: m.kcalMin, kcalMax: m.kcalMax, proteinG: m.proteinG, carbsG: m.carbsG, fatG: m.fatG,
      basePrice: Number(m.basePrice),
    })),
    addons: addonRows.map((a) => ({ key: a.key, name: a.name, pricePerWeek: Number(a.pricePerWeek) })),
    frequencies: freqRows.map((f) => ({ id: f.id, key: f.key, name: f.name, daysPerWeek: f.daysPerWeek, courierDiscountPct: f.courierDiscountPct })),
    durations: durRows.map((d) => ({ id: d.id, weeks: d.weeks, discountPct: d.discountPct })),
    zones: zoneRows.map((z) => ({ id: z.id, name: z.name, postalPrefixes: z.postalPrefixes, slotWindow: z.slotWindow, active: z.active })),
  };
}
```

- [ ] **Step 2a: `buildPricingCatalog` as a plain (non-server-action) module**

> **Why a separate file:** a `"use server"` module may export **only async functions**. `buildPricingCatalog` is a synchronous pure helper and is also imported by the checkout action (Task 8), so it lives in a plain module both server-action files import.

`apps/web/lib/pricing/build-catalog.ts`:
```ts
import { ValidationError } from "@tiffin/commons";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import type { PricingCatalog, PricingSelections } from "@/lib/pricing";

export function buildPricingCatalog(snapshot: CatalogSnapshot, selections: PricingSelections): PricingCatalog {
  const mealSize = snapshot.mealSizes.find((m) => m.id === selections.mealSizeId);
  if (!mealSize) throw new ValidationError("Invalid meal size");

  const frequency = snapshot.frequencies.find((f) => f.key === selections.frequencyKey);
  if (!frequency) throw new ValidationError("Invalid frequency");

  const durationPackage = snapshot.durations.find((d) => d.weeks === selections.durationWeeks);
  if (!durationPackage) throw new ValidationError("Invalid duration");

  const sat = snapshot.addons.find((a) => a.key === "saturday")?.pricePerWeek ?? 0;
  const sun = snapshot.addons.find((a) => a.key === "sunday")?.pricePerWeek ?? 0;

  return {
    mealSize: { id: mealSize.id, basePrice: mealSize.basePrice },
    frequency: { key: frequency.key, daysPerWeek: frequency.daysPerWeek, courierDiscountPct: frequency.courierDiscountPct },
    addons: { saturday: sat, sunday: sun },
    durationPackage: { weeks: durationPackage.weeks, discountPct: durationPackage.discountPct },
  };
}
```

- [ ] **Step 2b: the reprice/validatePostal server actions**

`apps/web/app/(public)/subscribe/actions.ts`:
```ts
"use server";

import { matchZone } from "@/lib/catalog/postal";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { buildPricingCatalog } from "@/lib/pricing/build-catalog";
import { priceSubscription, type PricingResult, type PricingSelections } from "@/lib/pricing";

export async function reprice(selections: PricingSelections): Promise<PricingResult> {
  const snapshot = await loadCatalogSnapshot();
  return priceSubscription(selections, buildPricingCatalog(snapshot, selections));
}

export async function validatePostal(postalCode: string): Promise<{ served: boolean; zone?: { id: string; name: string; slotWindow: string } }> {
  const snapshot = await loadCatalogSnapshot();
  const zone = matchZone(postalCode, snapshot.zones);
  if (!zone) return { served: false };
  const full = snapshot.zones.find((z) => z.name === zone.name)!;
  return { served: true, zone: { id: full.id, name: full.name, slotWindow: full.slotWindow } };
}
```

- [ ] **Step 3: Read-only catalog REST via the factory**

`apps/web/lib/services/catalog.service.ts`:
```ts
import { UpdatableRepository, UpdatableService } from "@tiffin/commons-drizzle";
import { db } from "@/db/client";
import { mealSizes } from "@/db/schema";

const mealSizeRepo = new UpdatableRepository(db, mealSizes, mealSizes.id);
export const mealSizeService = new UpdatableService(mealSizeRepo);
```

`apps/web/app/api/meal-sizes/route.ts`:
```ts
import { createCollectionRoute } from "@tiffin/commons-next";
import { mealSizeService } from "@/lib/services/catalog.service";

export const { GET, POST } = createCollectionRoute(mealSizeService);
```

`apps/web/app/api/meal-sizes/query/route.ts`:
```ts
import { createQueryRoute } from "@tiffin/commons-next";
import { mealSizeService } from "@/lib/services/catalog.service";

export const { POST } = createQueryRoute(mealSizeService);
```

- [ ] **Step 4: Verify the reprice action and REST against the running app**

Run (DB up + catalog seeded):
```bash
pnpm --filter web dev &
sleep 6
curl -s localhost:3000/api/meal-sizes | head -c 300; echo
kill %1
```
Expected: `/api/meal-sizes` returns `{ items: [...8 meal sizes...], page, size, total }`. (The `reprice` server action is exercised end-to-end by the wizard in Task 7.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/catalog apps/web/app/\(public\)/subscribe/actions.ts apps/web/lib/services/catalog.service.ts apps/web/app/api/meal-sizes
git commit -m "feat(catalog): snapshot loader, reprice + postal server actions, meal-sizes REST"
```

---

### Task 7: 4-step subscription wizard UI

**Files:**
- Create: `apps/web/app/(public)/subscribe/page.tsx`
- Create: `apps/web/components/wizard/wizard.tsx`, `apps/web/components/wizard/selections.ts`, `apps/web/components/wizard/invoice.tsx`
- Create step components: `apps/web/components/wizard/steps/step-baseline.tsx`, `step-bundle.tsx`, `step-schedule.tsx`, `step-duration.tsx`

**Interfaces:**
- Consumes: `loadCatalogSnapshot`, `reprice`, `CatalogSnapshot`, `PricingResult`, `PricingSelections`.
- Produces: `WizardSelections` (UI state = `PricingSelections` + `planKey`), and the rendered `/subscribe` flow that persists selections to `sessionStorage` under key `tiffin.wizard` before routing to `/checkout`.

- [ ] **Step 1: Add the shadcn components used by the wizard**

Run (from repo root; shadcn writes into `apps/web`):
```bash
cd apps/web
npx -y shadcn@latest add card button tabs radio-group label input separator badge
cd ../..
```
Expected: components created under `apps/web/components/ui/`. Reference the **shadcn MCP server** for current component APIs while wiring them. Apply the **`impeccable`** skill for layout, hierarchy, spacing, and motion as you build each screen.

- [ ] **Step 2: Shared selections type + page (server loads catalog)**

`apps/web/components/wizard/selections.ts`:
```ts
import type { PricingSelections } from "@/lib/pricing";

export interface WizardSelections extends PricingSelections {
  planKey: "veg" | "halal_nonveg" | "mixed" | null;
}

export const WIZARD_STORAGE_KEY = "tiffin.wizard";

export const initialSelections: WizardSelections = {
  planKey: null,
  mealSizeId: "",
  frequencyKey: "5_day",
  dailyQty: 1,
  includeSaturday: false,
  includeSunday: false,
  isStudent: false,
  durationWeeks: 1,
};
```

`apps/web/app/(public)/subscribe/page.tsx`:
```tsx
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { Wizard } from "@/components/wizard/wizard";

export default async function SubscribePage() {
  const catalog = await loadCatalogSnapshot();
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Build your tiffin subscription</h1>
      <p className="mt-1 text-sm text-muted-foreground">Four quick steps to your weekly plan.</p>
      <div className="mt-8">
        <Wizard catalog={catalog} />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: The live invoice component**

`apps/web/components/wizard/invoice.tsx`:
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
        {result.discounts.map((d) => (
          <li key={d.label} className="flex justify-between text-emerald-600">
            <span>{d.label}</span><span>−${d.amount.toFixed(2)}</span>
          </li>
        ))}
      </ul>
      <Separator className="my-3" />
      <div className="flex justify-between font-medium">
        <span>Weekly fee</span><span>${result.weeklyFee.toFixed(2)}</span>
      </div>
      <div className="flex justify-between text-base font-semibold">
        <span>Total ({result.durationWeeks} wk)</span><span>${result.total.toFixed(2)}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Step components**

`apps/web/components/wizard/steps/step-baseline.tsx`:
```tsx
import type { CatalogSnapshot } from "@/lib/catalog/types";
import type { WizardSelections } from "../selections";
import { Card } from "@/components/ui/card";

export function StepBaseline({ catalog, selections, set }: {
  catalog: CatalogSnapshot;
  selections: WizardSelections;
  set: (patch: Partial<WizardSelections>) => void;
}) {
  return (
    <div className="grid gap-3">
      {catalog.plans.map((p) => (
        <Card
          key={p.key}
          role="button"
          onClick={() => set({ planKey: p.key as WizardSelections["planKey"], mealSizeId: "" })}
          className={`cursor-pointer p-4 transition ${selections.planKey === p.key ? "ring-2 ring-primary" : "hover:bg-accent"}`}
        >
          <div className="font-medium">{p.name}</div>
          <div className="text-sm text-muted-foreground">{p.description}</div>
        </Card>
      ))}
    </div>
  );
}
```

`apps/web/components/wizard/steps/step-bundle.tsx`:
```tsx
import { useState } from "react";
import type { CatalogSnapshot, MealSizeView } from "@/lib/catalog/types";
import type { WizardSelections } from "../selections";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

type DietTab = "all" | "veg" | "nonveg";

const visibleFor = (plan: WizardSelections["planKey"], diet: DietTab) => (m: MealSizeView) => {
  if (plan === "veg" && m.diet === "nonveg") return false;
  if (diet === "veg") return m.diet === "veg" || m.diet === "both";
  if (diet === "nonveg") return m.diet === "nonveg" || m.diet === "both";
  return true;
};

const TIERS: MealSizeView["tier"][] = ["budget", "medium", "premium"];

export function StepBundle({ catalog, selections, set }: {
  catalog: CatalogSnapshot;
  selections: WizardSelections;
  set: (patch: Partial<WizardSelections>) => void;
}) {
  const [diet, setDiet] = useState<DietTab>("all");
  const meals = catalog.mealSizes.filter(visibleFor(selections.planKey, diet));

  return (
    <div className="space-y-4">
      <Tabs value={diet} onValueChange={(v) => setDiet(v as DietTab)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="veg">Veg</TabsTrigger>
          <TabsTrigger value="nonveg">Non-Veg</TabsTrigger>
        </TabsList>
      </Tabs>

      {TIERS.map((tier) => {
        const tierMeals = meals.filter((m) => m.tier === tier);
        if (tierMeals.length === 0) return null;
        return (
          <section key={tier}>
            <h3 className="mb-2 text-sm font-semibold capitalize text-muted-foreground">{tier}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {tierMeals.map((m) => {
                const active = selections.mealSizeId === m.id;
                return (
                  <Card
                    key={m.id}
                    role="button"
                    onClick={() => set({ mealSizeId: m.id })}
                    className={`cursor-pointer p-4 transition ${active ? "ring-2 ring-primary" : "hover:bg-accent"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{m.name}</span>
                      <span className="text-sm">${m.basePrice.toFixed(2)}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{m.components.join(", ")}</div>
                    {active && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        <Badge variant="secondary">{m.kcalMin}–{m.kcalMax} kcal</Badge>
                        {m.proteinG != null && <Badge variant="secondary">P {m.proteinG}g</Badge>}
                        {m.carbsG != null && <Badge variant="secondary">C {m.carbsG}g</Badge>}
                        {m.fatG != null && <Badge variant="secondary">F {m.fatG}g</Badge>}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
```

`apps/web/components/wizard/steps/step-schedule.tsx`:
```tsx
import type { CatalogSnapshot } from "@/lib/catalog/types";
import type { WizardSelections } from "../selections";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function StepSchedule({ catalog, selections, set }: {
  catalog: CatalogSnapshot;
  selections: WizardSelections;
  set: (patch: Partial<WizardSelections>) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <Label className="text-sm font-medium">Delivery frequency</Label>
        <RadioGroup
          className="mt-2 grid gap-2"
          value={selections.frequencyKey}
          onValueChange={(v) => set({ frequencyKey: v as WizardSelections["frequencyKey"] })}
        >
          {catalog.frequencies.map((f) => (
            <div key={f.key} className="flex items-center gap-2 rounded-md border p-3">
              <RadioGroupItem id={f.key} value={f.key} />
              <Label htmlFor={f.key} className="flex-1">{f.name}{f.courierDiscountPct > 0 ? ` · ${f.courierDiscountPct}% courier discount` : ""}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <div>
        <Label className="text-sm font-medium">Daily tiffins (1–5)</Label>
        <div className="mt-2 flex items-center gap-3">
          <Button type="button" variant="outline" size="icon" onClick={() => set({ dailyQty: Math.max(1, selections.dailyQty - 1) })}>−</Button>
          <span className="w-8 text-center text-lg font-medium">{selections.dailyQty}</span>
          <Button type="button" variant="outline" size="icon" onClick={() => set({ dailyQty: Math.min(5, selections.dailyQty + 1) })}>+</Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Weekend add-ons (+$15/wk each)</Label>
        <label className="flex items-center gap-2 rounded-md border p-3">
          <input type="checkbox" checked={selections.includeSaturday} onChange={(e) => set({ includeSaturday: e.target.checked })} />
          <span>Include Saturday (Biryanis & Pulaos)</span>
        </label>
        <label className="flex items-center gap-2 rounded-md border p-3">
          <input type="checkbox" checked={selections.includeSunday} onChange={(e) => set({ includeSunday: e.target.checked })} />
          <span>Include Sunday (Curries & Parathas)</span>
        </label>
      </div>

      <label className="flex items-center gap-2 rounded-md border p-3">
        <input type="checkbox" checked={selections.isStudent} onChange={(e) => set({ isStudent: e.target.checked })} />
        <span>Student / newcomer household (10% credit)</span>
      </label>
    </div>
  );
}
```

`apps/web/components/wizard/steps/step-duration.tsx`:
```tsx
import type { CatalogSnapshot } from "@/lib/catalog/types";
import type { PricingResult } from "@/lib/pricing";
import type { WizardSelections } from "../selections";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Invoice } from "../invoice";

export function StepDuration({ catalog, selections, set, result }: {
  catalog: CatalogSnapshot;
  selections: WizardSelections;
  set: (patch: Partial<WizardSelections>) => void;
  result: PricingResult | null;
}) {
  return (
    <div className="space-y-6">
      <div>
        <Label className="text-sm font-medium">Commitment duration</Label>
        <RadioGroup
          className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5"
          value={String(selections.durationWeeks)}
          onValueChange={(v) => set({ durationWeeks: Number(v) })}
        >
          {catalog.durations.map((d) => (
            <div key={d.weeks} className="flex items-center gap-2 rounded-md border p-3">
              <RadioGroupItem id={`d${d.weeks}`} value={String(d.weeks)} />
              <Label htmlFor={`d${d.weeks}`}>{d.weeks}wk{d.discountPct > 0 ? ` (${d.discountPct}%)` : ""}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>
      <Invoice result={result} />
    </div>
  );
}
```

- [ ] **Step 5: The wizard orchestrator (client state + reprice)**

`apps/web/components/wizard/wizard.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import type { PricingResult } from "@/lib/pricing";
import { reprice } from "@/app/(public)/subscribe/actions";
import { Button } from "@/components/ui/button";
import { initialSelections, WIZARD_STORAGE_KEY, type WizardSelections } from "./selections";
import { StepBaseline } from "./steps/step-baseline";
import { StepBundle } from "./steps/step-bundle";
import { StepSchedule } from "./steps/step-schedule";
import { StepDuration } from "./steps/step-duration";

const STEPS = ["Baseline", "Bundle", "Schedule", "Duration"] as const;

export function Wizard({ catalog }: { catalog: CatalogSnapshot }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selections, setSelections] = useState<WizardSelections>(initialSelections);
  const [result, setResult] = useState<PricingResult | null>(null);

  const set = (patch: Partial<WizardSelections>) => setSelections((s) => ({ ...s, ...patch }));

  useEffect(() => {
    if (!selections.mealSizeId) { setResult(null); return; }
    let active = true;
    reprice(selections).then((r) => { if (active) setResult(r); }).catch(() => { if (active) setResult(null); });
    return () => { active = false; };
  }, [selections]);

  const canNext =
    (step === 0 && selections.planKey != null) ||
    (step === 1 && selections.mealSizeId !== "") ||
    step === 2 ||
    step === 3;

  const deploy = () => {
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(selections));
    router.push("/checkout");
  };

  return (
    <div className="space-y-6">
      <ol className="flex gap-2 text-xs">
        {STEPS.map((label, i) => (
          <li key={label} className={`rounded-full px-3 py-1 ${i === step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 && <StepBaseline catalog={catalog} selections={selections} set={set} />}
      {step === 1 && <StepBundle catalog={catalog} selections={selections} set={set} />}
      {step === 2 && <StepSchedule catalog={catalog} selections={selections} set={set} />}
      {step === 3 && <StepDuration catalog={catalog} selections={selections} set={set} result={result} />}

      <div className="flex justify-between">
        <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</Button>
        {step < 3
          ? <Button disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Next</Button>
          : <Button disabled={!selections.mealSizeId} onClick={deploy}>Deploy Plan Formulation</Button>}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Manual verification of the wizard**

Run (DB up + seeded):
```bash
pnpm --filter web dev
```
In a browser at `http://localhost:3000/subscribe`: pick a baseline → a meal size (macro panel appears) → adjust frequency/qty/add-ons/student → choose a duration and watch the live invoice update (MWF shows the courier discount, student/duration discounts apply). "Deploy Plan Formulation" navigates to `/checkout` (404 until Task 8 — expected). Confirm no console errors and that switching to MWF or toggling student changes the totals.

- [ ] **Step 7: Typecheck and commit**

```bash
pnpm --filter web typecheck
git add apps/web/app/\(public\)/subscribe apps/web/components/wizard apps/web/components/ui
git commit -m "feat(wizard): 4-step subscription builder with live server-side pricing"
```

---

### Task 8: 2-step checkout + confirm action (auto-provision, persist, deploymentId)

**Files:**
- Create: `apps/web/app/(public)/checkout/page.tsx`
- Create: `apps/web/components/checkout/checkout.tsx`
- Create: `apps/web/app/(public)/checkout/actions.ts`

**Interfaces:**
- Consumes: `reprice`, `validatePostal`, `buildPricingCatalog` (`@/lib/pricing/build-catalog`), `loadCatalogSnapshot`, `generateCode` (`@tiffin/commons`), `db`, `subscriptions`/`payments`/`users` tables, `auth()` (Plan 2), `hashPassword` (`@/lib/auth/password`, Plan 2).
- Produces:
  - server action `confirmSubscription(input)` → `{ deploymentId }` (recomputes price authoritatively, auto-provisions user if anonymous, inserts subscription + payment in a transaction).
  - the `/checkout` two-step UI that reads selections from `sessionStorage`.

- [ ] **Step 1: The confirm + postal server actions**

`apps/web/app/(public)/checkout/actions.ts`:
```ts
"use server";

import { generateCode, ValidationError } from "@tiffin/commons";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { payments, subscriptions, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { matchZone } from "@/lib/catalog/postal";
import { priceSubscription, type PricingSelections } from "@/lib/pricing";
import { buildPricingCatalog } from "@/lib/pricing/build-catalog";
import { hashPassword } from "@/lib/auth/password";
import { auth } from "@/lib/auth";

const TEMP_PASSWORD = "Tiffin123";

export interface ConfirmInput {
  selections: PricingSelections;
  planKey: string;
  contact: { fullName: string; email: string; addressLine: string; city: string; postalCode: string };
}

export async function confirmSubscription(input: ConfirmInput): Promise<{ deploymentId: string }> {
  const snapshot = await loadCatalogSnapshot();

  // Authoritative recompute — never trust client totals.
  const pricing = priceSubscription(input.selections, buildPricingCatalog(snapshot, input.selections));

  const plan = snapshot.plans.find((p) => p.key === input.planKey);
  if (!plan) throw new ValidationError("Invalid plan");
  const frequency = snapshot.frequencies.find((f) => f.key === input.selections.frequencyKey)!;
  const zone = matchZone(input.contact.postalCode, snapshot.zones);
  const zoneRow = zone ? snapshot.zones.find((z) => z.name === zone.name) : undefined;

  const session = await auth();
  let userId = session?.user?.id ?? null;

  if (!userId) {
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, input.contact.email)).limit(1);
    if (existing[0]) {
      userId = existing[0].id;
    } else {
      const passwordHash = await hashPassword(TEMP_PASSWORD);
      const [created] = await db.insert(users).values({
        email: input.contact.email, name: input.contact.fullName, passwordHash, role: "user",
      }).returning({ id: users.id });
      userId = created.id;
    }
  }

  const deploymentId = generateCode("SUB", 4);

  await db.transaction(async (tx) => {
    const [sub] = await tx.insert(subscriptions).values({
      userId,
      planId: plan.id,
      mealSizeId: input.selections.mealSizeId,
      frequencyId: frequency.id,
      dailyQty: input.selections.dailyQty,
      includeSaturday: input.selections.includeSaturday,
      includeSunday: input.selections.includeSunday,
      isStudent: input.selections.isStudent,
      durationWeeks: input.selections.durationWeeks,
      pricingSnapshot: pricing,
      weeklyFee: pricing.weeklyFee.toFixed(2),
      total: pricing.total.toFixed(2),
      status: zoneRow ? "active" : "waitlisted",
      deploymentId,
      zoneId: zoneRow?.id ?? null,
      fullName: input.contact.fullName,
      addressLine: input.contact.addressLine,
      city: input.contact.city,
      postalCode: input.contact.postalCode,
    }).returning({ id: subscriptions.id });

    await tx.insert(payments).values({
      subscriptionId: sub.id, status: "simulated_paid", amount: pricing.total.toFixed(2),
    });
  });

  return { deploymentId };
}
```

> Depends on Plan 2: `@/lib/auth` exporting `auth()`, `@/lib/auth/password` exporting `hashPassword` (bcrypt, rounds=10), and the `users` table carrying `email`, `name`, `passwordHash`, `role`.

- [ ] **Step 2: The checkout client (2 steps)**

`apps/web/components/checkout/checkout.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PricingResult } from "@/lib/pricing";
import { reprice, validatePostal } from "@/app/(public)/subscribe/actions";
import { confirmSubscription } from "@/app/(public)/checkout/actions";
import { WIZARD_STORAGE_KEY, type WizardSelections } from "@/components/wizard/selections";
import { Invoice } from "@/components/wizard/invoice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Contact = { fullName: string; email: string; addressLine: string; city: string; postalCode: string };
const emptyContact: Contact = { fullName: "", email: "", addressLine: "", city: "", postalCode: "" };

export function Checkout() {
  const router = useRouter();
  const [selections, setSelections] = useState<WizardSelections | null>(null);
  const [result, setResult] = useState<PricingResult | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [contact, setContact] = useState<Contact>(emptyContact);
  const [zone, setZone] = useState<{ served: boolean; name?: string; slotWindow?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem(WIZARD_STORAGE_KEY);
    if (!raw) { router.replace("/subscribe"); return; }
    const s = JSON.parse(raw) as WizardSelections;
    setSelections(s);
    reprice(s).then(setResult).catch(() => setResult(null));
  }, [router]);

  const checkPostal = async () => {
    const res = await validatePostal(contact.postalCode);
    setZone(res.served ? { served: true, name: res.zone!.name, slotWindow: res.zone!.slotWindow } : { served: false });
  };

  const set = (patch: Partial<Contact>) => setContact((c) => ({ ...c, ...patch }));

  const confirm = async () => {
    if (!selections) return;
    setSubmitting(true);
    try {
      const { deploymentId } = await confirmSubscription({ selections, planKey: selections.planKey!, contact });
      sessionStorage.removeItem(WIZARD_STORAGE_KEY);
      router.push(`/activate/${deploymentId}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (!selections) return null;

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {step === 1 && (
          <section className="space-y-4">
            <h2 className="text-lg font-medium">Address & contact</h2>
            <div className="grid gap-3">
              <div><Label htmlFor="fullName">Full name</Label><Input id="fullName" value={contact.fullName} onChange={(e) => set({ fullName: e.target.value })} /></div>
              <div><Label htmlFor="email">Email</Label><Input id="email" type="email" value={contact.email} onChange={(e) => set({ email: e.target.value })} /></div>
              <div><Label htmlFor="addr">Address</Label><Input id="addr" value={contact.addressLine} onChange={(e) => set({ addressLine: e.target.value })} /></div>
              <div><Label htmlFor="city">City</Label><Input id="city" value={contact.city} onChange={(e) => set({ city: e.target.value })} /></div>
              <div className="flex items-end gap-2">
                <div className="flex-1"><Label htmlFor="postal">Postal code</Label><Input id="postal" value={contact.postalCode} onChange={(e) => set({ postalCode: e.target.value })} onBlur={checkPostal} /></div>
                <Button type="button" variant="outline" onClick={checkPostal}>Check</Button>
              </div>
              {zone?.served && <p className="text-sm text-emerald-600">Served — {zone.name}, delivery {zone.slotWindow}.</p>}
              {zone && !zone.served && <p className="text-sm text-amber-600">Not yet served — you'll join the waitlist for your area.</p>}
            </div>
            <Button disabled={!contact.fullName || !contact.email || !contact.postalCode} onClick={() => setStep(2)}>Continue to payment</Button>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-4">
            <h2 className="text-lg font-medium">Payment (simulated)</h2>
            <div className="grid gap-3">
              <div><Label htmlFor="card">Card number</Label><Input id="card" inputMode="numeric" placeholder="4242 4242 4242 4242" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label htmlFor="exp">Expiry</Label><Input id="exp" placeholder="12/29" /></div>
                <div><Label htmlFor="cvc">CVC</Label><Input id="cvc" placeholder="123" /></div>
              </div>
              <p className="text-xs text-muted-foreground">No real charge — payment is simulated for this MVP.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button disabled={submitting} onClick={confirm}>{submitting ? "Confirming…" : "Confirm Subscription"}</Button>
            </div>
          </section>
        )}
      </div>

      <aside className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Order summary</h3>
        <Invoice result={result} />
        {zone?.served && <p className="text-xs text-muted-foreground">Delivery window: {zone.slotWindow}</p>}
      </aside>
    </div>
  );
}
```

`apps/web/app/(public)/checkout/page.tsx`:
```tsx
import { Checkout } from "@/components/checkout/checkout";

export default function CheckoutPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>
      <div className="mt-8"><Checkout /></div>
    </main>
  );
}
```

- [ ] **Step 3: Manual end-to-end verification (wizard → checkout → DB)**

Run (DB up + seeded; Plan 2's `users`/`auth` present):
```bash
pnpm --filter web dev
```
Complete `/subscribe`, click "Deploy Plan Formulation", fill the checkout address (use a served prefix like `M9V 1A1` → shows the slot window; try `K1A 0B1` → waitlist notice), continue to simulated payment, click "Confirm Subscription". Expect a redirect to `/activate/SUB-XXXX` (page lands in Task 9). Verify persistence:
```bash
docker compose exec -T db psql -U tiffin -d tiffin -c "select deployment_id, status, weekly_fee, total from subscriptions order by created_at desc limit 1;"
docker compose exec -T db psql -U tiffin -d tiffin -c "select status, amount from payments order by created_at desc limit 1;"
docker compose exec -T db psql -U tiffin -d tiffin -c "select email, role from users order by created_at desc limit 1;"
```
Expected: one `subscriptions` row with a `SUB-XXXX` id and status `active` (served) or `waitlisted`; one `payments` row `simulated_paid`; a `users` row with role `user` (when checked out anonymously).

- [ ] **Step 4: Typecheck and commit**

```bash
pnpm --filter web typecheck
git add apps/web/app/\(public\)/checkout apps/web/components/checkout
git commit -m "feat(checkout): 2-step checkout, authoritative confirm, auto-provision + persist"
```

---

### Task 9: Activation / success screen

**Files:**
- Create: `apps/web/app/(public)/activate/[deploymentId]/page.tsx`

**Interfaces:**
- Consumes: `db`, `subscriptions` table.
- Produces: the activation page that confirms the `SUB-XXXX` id, the provisioned-account notice, and the allocation-survey link.

- [ ] **Step 1: Write the activation page (server component)**

`apps/web/app/(public)/activate/[deploymentId]/page.tsx`:
```tsx
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { subscriptions } from "@/db/schema";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default async function ActivatePage({ params }: { params: Promise<{ deploymentId: string }> }) {
  const { deploymentId } = await params;
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.deploymentId, deploymentId)).limit(1);
  if (!sub) notFound();

  const waitlisted = sub.status === "waitlisted";

  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <p className="text-sm uppercase tracking-wide text-muted-foreground">Service deployment</p>
      <h1 className="mt-2 text-3xl font-semibold">{sub.deploymentId}</h1>
      <p className="mt-3 text-muted-foreground">
        {waitlisted
          ? "You're on the waitlist for your area — we'll email you when delivery opens."
          : "Your subscription is active. Welcome to Tiffin Grab!"}
      </p>

      <Card className="mt-8 p-5 text-left text-sm">
        <div className="font-medium">Your account is ready</div>
        <p className="mt-1 text-muted-foreground">
          Log in with <span className="font-medium">{sub.fullName}</span>'s checkout email and the temporary
          password <code className="rounded bg-muted px-1">Tiffin123</code> to manage your delivery schedule.
        </p>
        <Separator className="my-4" />
        <div className="font-medium">One more step</div>
        <p className="mt-1 text-muted-foreground">
          Catalog your ingredient thresholds and spice preferences before your first shipment:
        </p>
        <a className="mt-2 inline-block text-primary underline" href="https://tiffingrab.ca/custom-allocation-form-v3" target="_blank" rel="noreferrer">
          Complete the allocation survey →
        </a>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Verify**

With the dev server running, complete a checkout (Task 8) and confirm the redirect lands on `/activate/SUB-XXXX` showing the deployment id, the `Tiffin123` notice, and the allocation-survey link. Visiting an unknown id (e.g. `/activate/SUB-ZZZZ`) renders the 404.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(public\)/activate
git commit -m "feat(activation): deployment-id success screen with account + allocation notice"
```

---

## Self-Review

**Spec coverage (subsystem C):**
- §4.2 Catalog schema (plans, meal_sizes w/ tier+diet enums, addons, frequencies, durations, zones) → Task 1; seeded with the brief's exact meals → Task 2. ✅
- §4.3 Orders (`subscriptions` updatable, `payments` immutable, status enums, `deploymentId` unique) → Task 3. ✅
- §5 Pricing engine (pure, server-side, ids→prices, courier→student→duration order, Vitest) → Task 4; consumed by the reprice action → Task 6 and authoritative checkout → Task 8. ✅
- §7 Step 1 baseline (diet filter) → Task 7 StepBaseline/StepBundle; Step 2 bundle (diet tabs, tier grouping, macro panel) → Task 7 StepBundle; Step 3 schedule (frequency, 1–5 qty, weekend add-ons, student) → Task 7 StepSchedule; Step 4 duration + live invoice + "Deploy Plan Formulation" → Task 7 StepDuration/Wizard; Checkout Step 1 address + Canadian postal validation (served slot vs waitlist) → Task 5 matcher + Task 8; Checkout Step 2 simulated payment + grand review + "Confirm Subscription" (re-price, auto-provision `Tiffin123`, persist, `SUB-XXXX`) → Task 8; Activation screen (SUB-XXXX, account notice, allocation link) → Task 9. ✅
- §8 UI (shadcn Nova components, shadcn MCP reference, `impeccable` for polish) → Task 7 Step 1 + notes throughout. ✅

**Placeholder scan:** none — every code step shows complete code; every test/verify step gives the exact command + expected output.

**Type consistency:** `PricingSelections`/`PricingCatalog`/`PricingResult`/`priceSubscription` consistent across Tasks 4, 6, 7, 8. `WizardSelections`/`WIZARD_STORAGE_KEY`/`initialSelections` consistent across Task 7 + 8. `loadCatalogSnapshot`/`buildPricingCatalog`/`reprice`/`validatePostal` defined in Task 6 and consumed identically in Tasks 7–8. `matchZone`/`ZoneLike` consistent Tasks 5–6/8. `confirmSubscription`/`ConfirmInput` defined Task 8, consumed by the Task 8 client.

**Cross-plan dependencies (must build B before C):** `users` table, `auth()` session helper, and `bcryptjs` come from Plan 2. `@tiffin/*` packages, `db` client, `baseColumns`/`updatableColumns`, and the migration toolchain come from Plan 1. The `feature_flags` table from Plan 1 is untouched here.

**Deferred (correct):** mixed-plan per-day dish selection → subsystem E (only the baseline config is stored). Admin catalog editing → subsystem D (this plan seeds + exposes read-only meal-sizes REST).

**Known gap (advisory, deferred to D):** catalog/order writes here use the plain `UpdatableService` and raw `db.insert` (anonymous public checkout), so `createdBy` is not stamped and `POST /api/meal-sizes` is unguarded. When subsystem D adds the admin catalog editor, route catalog writes through Plan 2's `SessionUpdatableService` + a `requireAdmin` guard. Acceptable for the public MVP funnel.
```
