# Catalog Settings Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stringly-typed, drift-prone catalog admin editor with one typed source of truth (Zod per resource) validated at the service write, surfaced through a Sheet-based form.

**Architecture:** Each catalog resource gets a Zod schema in `resource-config.ts`, imported by both the client form (zodResolver → inline errors) and a new `CatalogService` subclass that validates in `create`/`update` before calling `super` (extends-commons convention). The generic `ResourceEditor` moves to a right-side Sheet using react-hook-form, mirroring `new-inquiry-form.tsx`. Drift fixes: wire `pricing-tiers` + `addons` into `SERVICES`/`TABLES`, surface `courierDiscountPct` and `discountPct`.

**Tech Stack:** Next.js 16 (App Router, server actions), Drizzle ORM, `@tiffin/commons-drizzle`, Zod v4, react-hook-form + `@hookform/resolvers/zod`, shadcn Sheet/Form/Select/Switch, Vitest live-DB harness.

## Global Constraints

- Catalog scope ONLY. Do not touch `general` / `lead-assignment` / `lead-sources` / `meal-slots` settings pages.
- No DB migrations / schema restructure. Columns already exist; this surfaces and validates them.
- All writes go through commons services; validation lives in a subclass that overrides `create`/`update` and calls `super` (per [[services-extend-commons-convention]]).
- Admin controls are typed — select/multiselect/number/switch/date, never free-text for an enum/number/ref (TD-3 [[admin-typed-controls]]).
- Live-DB tests hit the real seeded Postgres; never delete shared fixtures (`usr_system`). Each test cleans only its own resource rows. Run tests with the env-file harness per [[live-db-test-harness]].
- Soft-delete semantics stay: `delete` sets `active=false`; reactivate sets `active=true`.
- `key` columns are stable identifiers: auto-slug from name, editable only on create, frozen on edit. Slug regex `^[a-z0-9-]+$`.

---

### Task 1: Per-resource Zod schemas + render metadata (single source of truth)

**Files:**
- Modify (rewrite): `apps/web/app/(dashboard)/dashboard/catalog/resource-config.ts`
- Test: `apps/web/app/(dashboard)/dashboard/catalog/__tests__/resource-config.test.ts` (create)

**Interfaces:**
- Produces:
  - `slug(name: string): string`
  - `type FieldType = "text" | "number" | "csv" | "select" | "multiselect" | "date" | "boolean"`
  - `interface FieldDef { key: string; label: string; type: FieldType; options?: string[]; optionsSource?: "mealSlots" | "weekdays"; optionLabels?: Record<string,string>; unit?: string; optional?: boolean; readOnlyOnEdit?: boolean }`
  - `interface ResourceDef { key: string; label: string; singular: string; schema: z.ZodObject<any>; fields: FieldDef[]; keyed: boolean }`
  - `const RESOURCES: Record<string, ResourceDef>`
  - `const WEEKDAY_OPTIONS`, `WEEKDAY_LABELS`
  - `rowToForm(def: ResourceDef, row: Record<string, unknown>): Record<string, unknown>` — DB row → form default values (arrays kept as arrays, scalars → string, booleans → boolean)
  - `emptyForm(def: ResourceDef): Record<string, unknown>` — blank defaults for create
- Consumes: nothing (foundation task).

Notes:
- `z.coerce.number()` for numeric fields so string inputs from the form coerce on parse (mirrors `inquiry-schema.ts:11`).
- Every schema includes `active: z.boolean().optional()` so reactivate's `{ active: true }` survives `.partial().parse`.
- `key` field uses `.regex(/^[a-z0-9-]+$/, "lowercase letters, numbers and hyphens only")`.
- `leadSources`/`optionsSource: "leadSources"` is removed — lead sources are out of catalog scope and managed on their own page.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/(dashboard)/dashboard/catalog/__tests__/resource-config.test.ts
import { describe, expect, it } from "vitest";
import { RESOURCES, slug, rowToForm } from "../resource-config";

describe("slug", () => {
  it("lowercases, hyphenates, strips junk", () => {
    expect(slug("Tiffin Standard")).toBe("tiffin-standard");
    expect(slug("  Healthy   Pro!! ")).toBe("healthy-pro");
    expect(slug("A/B & C")).toBe("a-b-c");
  });
});

describe("plans schema", () => {
  const s = RESOURCES.plans.schema;
  it("accepts a valid plan", () => {
    expect(() => s.parse({ key: "tiffin-standard", name: "Tiffin Standard", planType: "tiffin", offeredSlots: ["bf"], allowedStartDays: ["mon"] })).not.toThrow();
  });
  it("rejects a bad planType enum", () => {
    expect(() => s.parse({ key: "x", name: "X", planType: "deluxe", offeredSlots: [], allowedStartDays: [] })).toThrow();
  });
  it("rejects an invalid key slug", () => {
    expect(() => s.parse({ key: "Tiffin Standard", name: "X", planType: "tiffin", offeredSlots: [], allowedStartDays: [] })).toThrow();
  });
});

describe("delivery-frequencies schema surfaces courierDiscountPct", () => {
  it("coerces numbers and accepts courierDiscountPct", () => {
    const out = RESOURCES["delivery-frequencies"].schema.parse({ key: "weekly", name: "Weekly", daysPerWeek: "5", courierDiscountPct: "10" });
    expect(out.daysPerWeek).toBe(5);
    expect(out.courierDiscountPct).toBe(10);
  });
});

describe("duration-packages schema surfaces discountPct", () => {
  it("accepts weeks + discountPct, no key", () => {
    expect(RESOURCES["duration-packages"].keyed).toBe(false);
    const out = RESOURCES["duration-packages"].schema.parse({ weeks: "4", discountPct: "5" });
    expect(out.weeks).toBe(4);
    expect(out.discountPct).toBe(5);
  });
});

describe("addons resource exists", () => {
  it("is registered and keyed", () => {
    expect(RESOURCES.addons).toBeDefined();
    expect(RESOURCES.addons.keyed).toBe(true);
    expect(() => RESOURCES.addons.schema.parse({ key: "extra-roti", name: "Extra Roti", pricePerWeek: "12.50" })).not.toThrow();
  });
});

describe("rowToForm", () => {
  it("keeps arrays as arrays and stringifies scalars", () => {
    const out = rowToForm(RESOURCES.plans, { key: "x", name: "X", planType: "tiffin", offeredSlots: ["bf", "dn"], allowedStartDays: ["mon"], description: null });
    expect(out.offeredSlots).toEqual(["bf", "dn"]);
    expect(out.description).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run "app/(dashboard)/dashboard/catalog/__tests__/resource-config.test.ts"`
Expected: FAIL (`slug` / `RESOURCES.addons` / new fields not defined).

- [ ] **Step 3: Rewrite `resource-config.ts`**

```ts
// apps/web/app/(dashboard)/dashboard/catalog/resource-config.ts
import { z } from "zod";

export type FieldType = "text" | "number" | "csv" | "select" | "multiselect" | "date" | "boolean";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  optionsSource?: "mealSlots" | "weekdays";
  optionLabels?: Record<string, string>;
  unit?: string;
  optional?: boolean;
  readOnlyOnEdit?: boolean;
}

export interface ResourceDef {
  key: string;
  label: string;
  singular: string;
  schema: z.ZodObject<z.ZodRawShape>;
  fields: FieldDef[];
  keyed: boolean;
}

export const WEEKDAY_OPTIONS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const WEEKDAY_LABELS: Record<string, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday",
};
const ENUM_LABELS: Record<string, string> = {
  tiffin: "Tiffin", healthy: "Healthy", budget: "Budget", medium: "Medium", premium: "Premium",
  veg: "Veg", nonveg: "Non-veg", both: "Both",
};

export function slug(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const key = z.string().trim().regex(/^[a-z0-9-]+$/, "lowercase letters, numbers and hyphens only");
const name = z.string().trim().min(1, "Name is required");
const active = z.boolean().optional();

const plansSchema = z.object({
  key, name,
  description: z.string().trim().optional().nullable(),
  planType: z.enum(["tiffin", "healthy"]),
  offeredSlots: z.array(z.string()).default([]),
  allowedStartDays: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])).default([]),
  active,
});

const mealSizesSchema = z.object({
  key, name,
  tier: z.enum(["budget", "medium", "premium"]),
  diet: z.enum(["veg", "nonveg", "both"]),
  components: z.array(z.string()).default([]),
  kcalMin: z.coerce.number().int().nonnegative(),
  kcalMax: z.coerce.number().int().nonnegative(),
  proteinG: z.coerce.number().int().nonnegative().optional().nullable(),
  carbsG: z.coerce.number().int().nonnegative().optional().nullable(),
  fatG: z.coerce.number().int().nonnegative().optional().nullable(),
  basePrice: z.coerce.number().nonnegative(),
  active,
});

const deliveryFrequenciesSchema = z.object({
  key, name,
  daysPerWeek: z.coerce.number().int().min(1).max(7),
  courierDiscountPct: z.coerce.number().int().min(0).max(100).default(0),
  active,
});

const durationPackagesSchema = z.object({
  weeks: z.coerce.number().int().positive(),
  discountPct: z.coerce.number().int().min(0).max(100).default(0),
  active,
});

const deliveryZonesSchema = z.object({
  name,
  postalPrefixes: z.array(z.string()).default([]),
  slotWindow: z.string().trim().min(1, "Slot window is required"),
  active,
});

const pricingTiersSchema = z.object({
  minQty: z.coerce.number().int().nonnegative(),
  maxQty: z.coerce.number().int().positive().optional().nullable(),
  upliftPct: z.coerce.number(),
  active,
});

const addonsSchema = z.object({
  key, name,
  pricePerWeek: z.coerce.number().nonnegative(),
  active,
});

export const RESOURCES: Record<string, ResourceDef> = {
  plans: {
    key: "plans", label: "Plans", singular: "plan", keyed: true, schema: plansSchema,
    fields: [
      { key: "key", label: "Key", type: "text", readOnlyOnEdit: true },
      { key: "name", label: "Name", type: "text" },
      { key: "description", label: "Description", type: "text", optional: true },
      { key: "planType", label: "Plan type", type: "select", options: ["tiffin", "healthy"], optionLabels: ENUM_LABELS },
      { key: "offeredSlots", label: "Offered slots", type: "multiselect", optionsSource: "mealSlots" },
      { key: "allowedStartDays", label: "Allowed start days", type: "multiselect", optionsSource: "weekdays", optionLabels: WEEKDAY_LABELS },
    ],
  },
  "meal-sizes": {
    key: "meal-sizes", label: "Meal sizes", singular: "meal size", keyed: true, schema: mealSizesSchema,
    fields: [
      { key: "key", label: "Key", type: "text", readOnlyOnEdit: true },
      { key: "name", label: "Name", type: "text" },
      { key: "tier", label: "Tier", type: "select", options: ["budget", "medium", "premium"], optionLabels: ENUM_LABELS },
      { key: "diet", label: "Diet", type: "select", options: ["veg", "nonveg", "both"], optionLabels: ENUM_LABELS },
      { key: "components", label: "Components", type: "csv" },
      { key: "kcalMin", label: "kcal min", type: "number", unit: "kcal" },
      { key: "kcalMax", label: "kcal max", type: "number", unit: "kcal" },
      { key: "proteinG", label: "Protein", type: "number", unit: "g", optional: true },
      { key: "carbsG", label: "Carbs", type: "number", unit: "g", optional: true },
      { key: "fatG", label: "Fat", type: "number", unit: "g", optional: true },
      { key: "basePrice", label: "Base price", type: "number", unit: "$" },
    ],
  },
  "delivery-frequencies": {
    key: "delivery-frequencies", label: "Delivery frequencies", singular: "delivery frequency", keyed: true, schema: deliveryFrequenciesSchema,
    fields: [
      { key: "key", label: "Key", type: "text", readOnlyOnEdit: true },
      { key: "name", label: "Name", type: "text" },
      { key: "daysPerWeek", label: "Days / week", type: "number" },
      { key: "courierDiscountPct", label: "Courier discount", type: "number", unit: "%" },
    ],
  },
  "duration-packages": {
    key: "duration-packages", label: "Duration packages", singular: "duration package", keyed: false, schema: durationPackagesSchema,
    fields: [
      { key: "weeks", label: "Weeks", type: "number" },
      { key: "discountPct", label: "Discount", type: "number", unit: "%" },
    ],
  },
  "delivery-zones": {
    key: "delivery-zones", label: "Delivery zones", singular: "delivery zone", keyed: false, schema: deliveryZonesSchema,
    fields: [
      { key: "name", label: "Name", type: "text" },
      { key: "postalPrefixes", label: "Postal prefixes", type: "csv" },
      { key: "slotWindow", label: "Slot window", type: "text" },
    ],
  },
  "pricing-tiers": {
    key: "pricing-tiers", label: "Pricing tiers", singular: "pricing tier", keyed: false, schema: pricingTiersSchema,
    fields: [
      { key: "minQty", label: "Min qty", type: "number" },
      { key: "maxQty", label: "Max qty (blank = unbounded)", type: "number", optional: true },
      { key: "upliftPct", label: "Uplift %", type: "number", unit: "%" },
    ],
  },
  addons: {
    key: "addons", label: "Add-ons", singular: "add-on", keyed: true, schema: addonsSchema,
    fields: [
      { key: "key", label: "Key", type: "text", readOnlyOnEdit: true },
      { key: "name", label: "Name", type: "text" },
      { key: "pricePerWeek", label: "Price / week", type: "number", unit: "$" },
    ],
  },
};

const ARRAY_TYPES = new Set<FieldType>(["csv", "multiselect"]);

export function rowToForm(def: ResourceDef, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of def.fields) {
    const v = row[f.key];
    if (ARRAY_TYPES.has(f.type)) out[f.key] = Array.isArray(v) ? v : [];
    else if (f.type === "boolean") out[f.key] = Boolean(v);
    else out[f.key] = v == null ? "" : String(v);
  }
  return out;
}

export function emptyForm(def: ResourceDef): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of def.fields) out[f.key] = ARRAY_TYPES.has(f.type) ? [] : f.type === "boolean" ? false : "";
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && pnpm vitest run "app/(dashboard)/dashboard/catalog/__tests__/resource-config.test.ts"`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(dashboard)/dashboard/catalog/resource-config.ts" "apps/web/app/(dashboard)/dashboard/catalog/__tests__/resource-config.test.ts"
git commit -m "feat(catalog): per-resource zod schemas as single source of truth"
```

---

### Task 2: Validate in the service + wire pricing-tiers & addons (drift/crash fixes)

**Files:**
- Modify: `apps/web/lib/services/catalog.service.ts`
- Modify: `apps/web/app/(dashboard)/dashboard/catalog/actions.ts`
- Modify: `apps/web/app/(dashboard)/dashboard/catalog/[resource]/page.tsx:13-22` (add `addons` to `TABLES`)
- Test: `apps/web/lib/services/__tests__/catalog-validation.service.test.ts` (create)

**Interfaces:**
- Consumes: `RESOURCES[...].schema` from Task 1; `SoftDeleteService`, `SessionUpdatableService` (existing); commons `UpdatableRepository`.
- Produces:
  - `class CatalogService<TTable> extends SoftDeleteService<TTable>` with a `schema` field; `create`/`update` validate then call `super`.
  - `addonService` exported as a `CatalogService` (already exists as `SoftDeleteService` — convert).
  - `SERVICES` in `actions.ts` includes `"pricing-tiers"` and `"addons"`.

Notes:
- The service validates with the SAME resource schema. Use `schema.parse` on create, `schema.partial().parse` on update so partial patches (e.g. reactivate `{active:true}`, single-field edit) pass.
- The service is the integrity authority; the action stays thin.
- Unique-key violations bubble up as Postgres errors; keep the existing action error surface (the editor shows `e.message`). No special handling required for this task.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/services/__tests__/catalog-validation.service.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { addons, deliveryFrequencies, plans, pricingTiers } from "@/db/schema";
import { addonService, deliveryFrequencyService, planService, pricingTierService } from "@/lib/services/catalog.service";

afterEach(async () => {
  await db.delete(plans).where(eq(plans.key, "zz-test-plan"));
  await db.delete(deliveryFrequencies).where(eq(deliveryFrequencies.key, "zz-test-freq"));
  await db.delete(addons).where(eq(addons.key, "zz-test-addon"));
  await db.delete(pricingTiers).where(eq(pricingTiers.minQty, 9999));
});

describe("catalog service validation", () => {
  it("rejects a bad planType enum", async () => {
    await expect(planService.create({ key: "zz-test-plan", name: "ZZ", planType: "deluxe", offeredSlots: [], allowedStartDays: [] }))
      .rejects.toThrow();
  });

  it("rejects a key with spaces", async () => {
    await expect(planService.create({ key: "ZZ Test", name: "ZZ", planType: "tiffin", offeredSlots: [], allowedStartDays: [] }))
      .rejects.toThrow();
  });

  it("coerces numeric strings and persists surfaced columns", async () => {
    const row = await deliveryFrequencyService.create({ key: "zz-test-freq", name: "ZZ Freq", daysPerWeek: "5", courierDiscountPct: "15" });
    expect(row.daysPerWeek).toBe(5);
    expect(row.courierDiscountPct).toBe(15);
  });

  it("pricing-tier create works (regression: was missing from SERVICES)", async () => {
    const row = await pricingTierService.create({ minQty: 9999, maxQty: null, upliftPct: "2.5" });
    expect(row.minQty).toBe(9999);
  });

  it("addon create works (new resource)", async () => {
    const row = await addonService.create({ key: "zz-test-addon", name: "ZZ Addon", pricePerWeek: "12.50" });
    expect(row.key).toBe("zz-test-addon");
  });

  it("partial update (reactivate) passes validation", async () => {
    const row = await addonService.create({ key: "zz-test-addon", name: "ZZ Addon", pricePerWeek: "10" });
    await expect(addonService.update(row.publicId, { active: false })).resolves.toBeTruthy();
    await expect(addonService.update(row.publicId, { active: true })).resolves.toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run "lib/services/__tests__/catalog-validation.service.test.ts"`
Expected: FAIL (validation not enforced; `pricingTierService`/`addonService` not validating; possibly type errors importing).

- [ ] **Step 3: Rewrite `catalog.service.ts`**

```ts
import { UpdatableRepository } from "@tiffin/commons-drizzle";
import type { PgTable } from "drizzle-orm/pg-core";
import type { z } from "zod";
import { db } from "@/db/client";
import { addons, deliveryFrequencies, deliveryZones, durationPackages, mealSizes, plans, pricingTiers } from "@/db/schema";
import { RESOURCES } from "@/app/(dashboard)/dashboard/catalog/resource-config";
import { SessionUpdatableService } from "./session-service";

// "Delete" retires the row (active=false) so historical orders that reference
// it stay valid; the wizard loader filters these out, the admin editor shows them.
class SoftDeleteService<TTable extends PgTable> extends SessionUpdatableService<TTable> {
  async delete(id: string): Promise<number> {
    await this.update(id, { active: false });
    return 1;
  }
}

// Validates every write against the resource's zod schema before it reaches the
// repository, so any caller (action, seed, future API) is held to the same shape.
class CatalogService<TTable extends PgTable> extends SoftDeleteService<TTable> {
  constructor(repo: UpdatableRepository<TTable>, private schema: z.ZodObject<z.ZodRawShape>) {
    super(repo);
  }
  async create(values: Record<string, unknown>) {
    return super.create(this.schema.parse(values));
  }
  async update(id: string, patch: Record<string, unknown>) {
    return super.update(id, this.schema.partial().parse(patch));
  }
}

const mk = <T extends PgTable>(table: T, publicId: T["_"]["columns"][string], id: T["_"]["columns"][string], schemaKey: string) =>
  new CatalogService(new UpdatableRepository(db, table, publicId, id), RESOURCES[schemaKey].schema);

export const planService = mk(plans, plans.publicId, plans.id, "plans");
export const mealSizeService = mk(mealSizes, mealSizes.publicId, mealSizes.id, "meal-sizes");
export const addonService = mk(addons, addons.publicId, addons.id, "addons");
export const deliveryFrequencyService = mk(deliveryFrequencies, deliveryFrequencies.publicId, deliveryFrequencies.id, "delivery-frequencies");
export const durationPackageService = mk(durationPackages, durationPackages.publicId, durationPackages.id, "duration-packages");
export const deliveryZoneService = mk(deliveryZones, deliveryZones.publicId, deliveryZones.id, "delivery-zones");
export const pricingTierService = mk(pricingTiers, pricingTiers.publicId, pricingTiers.id, "pricing-tiers");
```

Note: if the `mk` generic column typing fights TypeScript, fall back to the explicit per-service form used before (`new CatalogService(new UpdatableRepository(db, plans, plans.publicId, plans.id), RESOURCES.plans.schema)`), one line each. Keep whichever typechecks.

- [ ] **Step 4: Wire `pricing-tiers` + `addons` into the action `SERVICES` map**

```ts
// apps/web/app/(dashboard)/dashboard/catalog/actions.ts — SERVICES map
import {
  addonService,
  deliveryFrequencyService,
  deliveryZoneService,
  durationPackageService,
  mealSizeService,
  planService,
  pricingTierService,
} from "@/lib/services/catalog.service";
// NOTE: lead-source services were never catalog resources — drop them from this map;
// lead sources are managed on /dashboard/settings/lead-sources.

const SERVICES = {
  plans: planService,
  "meal-sizes": mealSizeService,
  "delivery-frequencies": deliveryFrequencyService,
  "duration-packages": durationPackageService,
  "delivery-zones": deliveryZoneService,
  "pricing-tiers": pricingTierService,
  addons: addonService,
} as const;
```

(Keep `saveItem`/`retireItem`/`reactivateItem` bodies unchanged — they already index `SERVICES[resource]`. `ResourceKey = keyof typeof SERVICES` now covers all seven.)

- [ ] **Step 5: Add `addons` to `TABLES` in `[resource]/page.tsx`**

```ts
// apps/web/app/(dashboard)/dashboard/catalog/[resource]/page.tsx
import { addons, deliveryFrequencies, deliveryZones, durationPackages, mealSizes, plans, pricingTiers } from "@/db/schema";

const TABLES: Record<string, PgTable> = {
  plans,
  "meal-sizes": mealSizes,
  "delivery-frequencies": deliveryFrequencies,
  "duration-packages": durationPackages,
  "delivery-zones": deliveryZones,
  "pricing-tiers": pricingTiers,
  addons,
};
```

(Remove `leadSources`/`leadSubsources` imports + entries and the `leadSources` dynamic-options branch — out of catalog scope. The `mealSlots`/`weekdays` branches stay.)

- [ ] **Step 6: Run the new test + the existing catalog tests**

Run: `cd apps/web && pnpm vitest run "lib/services/__tests__/catalog-validation.service.test.ts" "lib/services/__tests__/catalog-soft-delete.test.ts" "lib/services/__tests__/catalog-editor-actions.test.ts"`
Expected: PASS (new validation passes; existing soft-delete + editor-action round-trips still green).

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/services/catalog.service.ts "apps/web/app/(dashboard)/dashboard/catalog/actions.ts" "apps/web/app/(dashboard)/dashboard/catalog/[resource]/page.tsx" apps/web/lib/services/__tests__/catalog-validation.service.test.ts
git commit -m "fix(catalog): validate writes via zod in service; wire pricing-tiers + addons"
```

---

### Task 3: Sheet-based ResourceEditor (typed form, slug behaviour, polish)

**Files:**
- Modify (rewrite): `apps/web/app/(dashboard)/dashboard/catalog/[resource]/resource-editor.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/catalog/[resource]/page.tsx` (pass nothing new beyond existing props; `dynamicOptions` stays — now only `mealSlots`/`weekdays`)

**Interfaces:**
- Consumes: `RESOURCES[...]` (`schema`, `fields`, `singular`, `keyed`), `slug`, `rowToForm`, `emptyForm` from Task 1; `saveItem`, `retireItem`, `reactivateItem`, `ResourceKey` from `actions.ts`; shadcn `Sheet`, `Form`, `Select`, `Switch`, `Input`, `Button`, `Badge`.
- Produces: `ResourceEditor` (same export name + props signature as today: `{ resource, def, rows, dynamicOptions }`).

Notes:
- Generic editor → `useForm({ resolver: zodResolver(def.schema), defaultValues })` typed as `Record<string, unknown>` (per-resource static typing isn't possible in one generic component; the schema enforces at runtime + zodResolver renders messages). This is the deliberate tradeoff.
- Slug: when creating AND the field is `key` (readOnlyOnEdit) AND not manually overridden, `key` mirrors `slug(watch("name"))`. A small "Edit" toggle unlocks manual entry on create. On edit (`editingId !== "__new__"`) the `key` field is disabled (frozen identifier).
- Submit: call `saveItem(resource, editingId==="__new__" ? null : editingId, values)`. On error, `form.setError("root", ...)`; if the message mentions the unique key, also `form.setError("key", ...)`.
- Polish: autofocus first field; Save shows `Loader2Icon` spinner + disables while `isSubmitting`; Sheet closes + `router.refresh()` on success; multiselect as chip toggles; number inputs carry `class="nums"` + unit adornment.

- [ ] **Step 1: Rewrite `resource-editor.tsx`**

```tsx
"use client";

import { Loader2Icon, PencilIcon, PlusIcon } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  emptyForm, rowToForm, slug, type FieldDef, type ResourceDef,
} from "../resource-config";
import { reactivateItem, retireItem, saveItem, type ResourceKey } from "../actions";

type Row = Record<string, unknown> & { publicId: string };
type Options = Record<string, { value: string; label: string }[]>;

function FieldControl({
  f, def, form, options, isNew,
}: {
  f: FieldDef;
  def: ResourceDef;
  form: ReturnType<typeof useForm<Record<string, unknown>>>;
  options: Options;
  isNew: boolean;
}) {
  const opts = f.optionsSource ? (options[f.key] ?? []) : (f.options ?? []).map((o) => ({ value: o, label: f.optionLabels?.[o] ?? o }));
  const keyFrozen = f.readOnlyOnEdit && !isNew;

  return (
    <FormField
      control={form.control}
      name={f.key}
      render={({ field }) => (
        <FormItem className="grid gap-1.5">
          <FormLabel>
            {f.label}
            {f.optional ? <span className="text-muted-foreground font-normal"> optional</span> : null}
          </FormLabel>
          {f.type === "select" ? (
            <Select value={(field.value as string) ?? ""} onValueChange={field.onChange}>
              <FormControl><SelectTrigger><SelectValue placeholder={`Select ${f.label.toLowerCase()}`} /></SelectTrigger></FormControl>
              <SelectContent>{opts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          ) : f.type === "multiselect" ? (
            <div className="flex flex-wrap gap-2">
              {opts.map((o) => {
                const arr = (field.value as string[]) ?? [];
                const on = arr.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => field.onChange(on ? arr.filter((x) => x !== o.value) : [...arr, o.value])}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors active:scale-[0.97]",
                      on ? "border-primary/30 bg-primary/12 text-primary" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          ) : f.type === "csv" ? (
            <FormControl>
              <Input
                value={((field.value as string[]) ?? []).join(", ")}
                onChange={(e) => field.onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                placeholder="comma, separated, values"
              />
            </FormControl>
          ) : f.type === "boolean" ? (
            <FormControl><Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} /></FormControl>
          ) : f.type === "date" ? (
            <FormControl><Input type="date" value={(field.value as string) ?? ""} onChange={field.onChange} /></FormControl>
          ) : (
            <div className="flex items-center gap-1.5">
              {f.unit === "$" ? <span className="text-muted-foreground text-sm">$</span> : null}
              <FormControl>
                <Input
                  className={f.type === "number" ? "nums" : undefined}
                  type={f.type === "number" ? "number" : "text"}
                  disabled={keyFrozen}
                  value={(field.value as string) ?? ""}
                  onChange={field.onChange}
                />
              </FormControl>
              {f.unit && f.unit !== "$" ? <span className="text-muted-foreground text-sm">{f.unit}</span> : null}
            </div>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function EditorSheet({
  resource, def, options, editing, onClose,
}: {
  resource: string;
  def: ResourceDef;
  options: Options;
  editing: { id: string; row: Row | null } | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const isNew = editing?.id === "__new__";
  const form = useForm<Record<string, unknown>>({
    resolver: zodResolver(def.schema),
    defaultValues: editing?.row ? rowToForm(def, editing.row) : emptyForm(def),
  });

  // On create, keep `key` mirrored to slug(name) until the user unlocks it manually.
  const [keyManual, setKeyManual] = useState(false);
  const nameVal = form.watch("name");
  useEffect(() => {
    if (isNew && def.keyed && !keyManual) form.setValue("key", slug(String(nameVal ?? "")));
  }, [isNew, def.keyed, keyManual, nameVal, form]);

  async function onSubmit(values: Record<string, unknown>) {
    try {
      await saveItem(resource as ResourceKey, isNew ? null : editing!.id, values);
      onClose();
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      if (/key|unique|duplicate/i.test(msg)) form.setError("key", { message: "That key is already taken" });
      form.setError("root", { message: msg });
    }
  }

  const submitting = form.formState.isSubmitting;
  const keyField = def.fields.find((f) => f.key === "key");

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-border/70 border-b px-5 py-4">
          <SheetTitle>{isNew ? `New ${def.singular}` : `Edit ${def.singular}`}</SheetTitle>
          <SheetDescription>Typed fields — values are validated before saving.</SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
            <div className="grid flex-1 gap-4 overflow-y-auto px-5 py-5 sm:grid-cols-2">
              {def.fields.map((f) => (
                <div key={f.key} className={f.type === "multiselect" || f.type === "csv" ? "sm:col-span-2" : undefined}>
                  <FieldControl f={f} def={def} form={form} options={options} isNew={isNew} />
                  {f.key === "key" && isNew && keyField?.readOnlyOnEdit && !keyManual ? (
                    <button type="button" className="text-muted-foreground hover:text-foreground mt-1 inline-flex items-center gap-1 text-xs" onClick={() => setKeyManual(true)}>
                      <PencilIcon className="size-3" /> Edit key
                    </button>
                  ) : null}
                </div>
              ))}
              {form.formState.errors.root ? (
                <p className="text-destructive sm:col-span-2 text-sm" role="alert">{form.formState.errors.root.message as string}</p>
              ) : null}
            </div>
            <SheetFooter className="border-border/70 flex-row justify-end gap-2 border-t">
              <SheetClose asChild><Button type="button" variant="outline" disabled={submitting}>Cancel</Button></SheetClose>
              <Button type="submit" disabled={submitting} className="active:scale-[0.98]">
                {submitting ? <Loader2Icon className="size-4 animate-spin" /> : null}
                {submitting ? "Saving…" : "Save"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}

export function ResourceEditor({
  resource, def, rows, dynamicOptions,
}: {
  resource: string;
  def: ResourceDef;
  rows: Row[];
  dynamicOptions: Options;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ id: string; row: Row | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const primary = def.fields[0].key;
  const secondary = def.fields.find((f) => f.type === "select");

  const act = async (fn: () => Promise<void>) => {
    setError(null);
    try { await fn(); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Action failed"); }
  };

  return (
    <div className="space-y-4">
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <Button onClick={() => setEditing({ id: "__new__", row: null })}>
        <PlusIcon className="size-4" /> Add {def.singular}
      </Button>

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.publicId} className="flex items-center justify-between rounded-md border p-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium">{String(row[primary] ?? row.publicId)}</span>
              {secondary && row[secondary.key] != null ? (
                <Badge variant="secondary">{secondary.optionLabels?.[String(row[secondary.key])] ?? String(row[secondary.key])}</Badge>
              ) : null}
              {row.active === false ? <Badge variant="outline">retired</Badge> : null}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing({ id: row.publicId, row })}>Edit</Button>
              {row.active === false ? (
                <Button size="sm" variant="outline" onClick={() => act(() => reactivateItem(resource as ResourceKey, row.publicId))}>Reactivate</Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => act(() => retireItem(resource as ResourceKey, row.publicId))}>Retire</Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {editing ? (
        <EditorSheet
          key={editing.id}
          resource={resource}
          def={def}
          options={dynamicOptions}
          editing={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `cd apps/web && pnpm typecheck && pnpm lint`
Expected: no errors in `resource-config.ts`, `catalog.service.ts`, `actions.ts`, `[resource]/page.tsx`, `resource-editor.tsx`.

- [ ] **Step 3: Manual smoke (each resource)**

Run the app (`pnpm dev`), visit `/dashboard/catalog/plans`, `/meal-sizes`, `/delivery-frequencies`, `/duration-packages`, `/delivery-zones`, `/pricing-tiers`, `/addons`. For each: Add opens the Sheet; creating a keyed resource auto-fills the slug from name; saving a pricing tier and an addon succeeds (the former previously crashed); Retire/Reactivate flips the badge.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(dashboard)/dashboard/catalog/[resource]/resource-editor.tsx" "apps/web/app/(dashboard)/dashboard/catalog/[resource]/page.tsx"
git commit -m "feat(catalog): sheet-based typed resource editor with auto-slug keys"
```

---

### Task 4: Settings index — surface addons + verify links

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/settings/page.tsx` (if it lists catalog resources, add Add-ons)
- Modify: `apps/web/app/(dashboard)/dashboard/catalog/page.tsx` (catalog index — add Add-ons card if it enumerates resources)

**Interfaces:**
- Consumes: `RESOURCES` from Task 1 if the index maps over it.

- [ ] **Step 1: Read both index pages**

Run: open `apps/web/app/(dashboard)/dashboard/catalog/page.tsx` and `.../settings/page.tsx`. If either hardcodes the resource list, add an `addons` entry pointing at `/dashboard/catalog/addons`. If `catalog/page.tsx` already maps over `RESOURCES`, no change is needed (addons appears automatically) — verify and skip.

- [ ] **Step 2: Apply the minimal edit (only if hardcoded)**

Add the Add-ons link mirroring the existing entries' shape (label "Add-ons", href `/dashboard/catalog/addons`).

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit (only if changed)**

```bash
git add "apps/web/app/(dashboard)/dashboard/catalog/page.tsx" "apps/web/app/(dashboard)/dashboard/settings/page.tsx"
git commit -m "feat(catalog): surface add-ons in catalog index"
```

---

## Final verification

- [ ] `cd apps/web && pnpm vitest run "app/(dashboard)/dashboard/catalog" "lib/services/__tests__/catalog-validation.service.test.ts" "lib/services/__tests__/catalog-soft-delete.test.ts" "lib/services/__tests__/catalog-editor-actions.test.ts"` — all green.
- [ ] `cd apps/web && pnpm typecheck && pnpm lint` — clean.
- [ ] Manual smoke per Task 3 Step 3 confirms pricing-tiers + addons save (no crash) and slug auto-fills.

## Self-review notes (coverage vs spec)

- Spec §2 single source of truth → Task 1 (zod per resource, imported both sides).
- Spec §3 service validation + drift fixes → Task 2 (`CatalogService`, pricing-tiers + addons wired, `courierDiscountPct`/`discountPct` surfaced via Task 1 fields).
- Spec §4 auto-slug keys → Task 1 `slug` + Task 3 mirror/freeze behaviour.
- Spec §5 Sheet UI → Task 3.
- Spec §6 testing → Task 1 (zod unit), Task 2 (live-DB validation + pricing-tiers regression + addons create), Task 3 (manual smoke).
- Spec "out of scope" honoured: no migrations; lead-source/leadSources references removed from catalog wiring; other settings pages untouched.
