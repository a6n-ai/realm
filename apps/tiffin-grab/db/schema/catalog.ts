import { updatableColumns } from "@foundry/database";
import type { FileDetail } from "@foundry/storage/model";
import { bigint, boolean, integer, jsonb, numeric, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { organization } from "./organizations";

export const mealTier = pgEnum("meal_tier", ["budget", "medium", "premium"]);
export const planType = pgEnum("plan_type", ["tiffin", "healthy"]);
export const mealSizeDiscountType = pgEnum("meal_size_discount_type", ["none", "percent", "flat"]);

// A dish carries no diet column. Which plans it may appear on is explicit
// membership — see dishPlans below.
export const dishes = pgTable("dishes", {
  ...updatableColumns("dsh"),
  name: text("name").notNull(),
  description: text("description"),
  image: jsonb("image").$type<FileDetail>(),
  // Soft ref to dish_categories.key (no DB FK — key is unique only per (planType, key)).
  // Nullable for back-compat: a null-category dish may be placed in any slot.
  category: text("category"),
  active: boolean("active").notNull().default(true),
  // Client-scoping — null = shared across the whole app, set = one org's own
  // catalog item. See db/schema/organizations.ts + orders.organizationId.
  organizationId: text("organization_id").references(() => organization.id),
});

export const plans = pgTable("plans", {
  ...updatableColumns("pln"),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  planType: planType("plan_type").notNull().default("tiffin"),
  allowedStartDays: text("allowed_start_days").array().notNull().default(["mon", "tue", "wed", "thu", "fri"]),
  // Display only. A dish shows the tags of the plans it is attached to, which is
  // what replaced the old veg/non-veg dot. Both are admin-set and rendered
  // verbatim — the code never reads them to decide anything, so renaming a plan
  // or adding a new one needs no code change.
  tagLabel: text("tag_label"),
  tagColor: text("tag_color"),
  active: boolean("active").notNull().default(true),
  // Client-scoping — see dishes.organizationId for the pattern.
  organizationId: text("organization_id").references(() => organization.id),
});

/**
 * Which plans a dish may appear on. Many-to-many on purpose: a veg dish belongs
 * to the veg plan AND the non-veg plan (a non-veg thali still contains sabzi,
 * daal and roti), so a single plan_id would force duplicate dish rows that drift
 * apart on edit.
 *
 * This is the food-safety boundary, and it replaces the old `diet` column. Every
 * menu query joins through here, so a dish with no row for a given plan simply
 * cannot be returned to a subscriber on that plan. The code never decides what a
 * dish *is* — only which plans an admin attached it to.
 */
export const dishPlans = pgTable(
  "dish_plans",
  {
    ...updatableColumns("dpl"),
    dishId: bigint("dish_id", { mode: "bigint" })
      .notNull()
      .references(() => dishes.id, { onDelete: "cascade" }),
    planId: bigint("plan_id", { mode: "bigint" })
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("dish_plans_dish_plan_unique").on(t.dishId, t.planId)],
);

export const mealSizes = pgTable("meal_sizes", {
  ...updatableColumns("msz"),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  // Scopes a meal size to exactly one plan; the subscribe wizard hides plans with no sizes.
  planId: bigint("plan_id", { mode: "bigint" }).notNull().references(() => plans.id),
  tier: mealTier("tier").notNull(),
  components: jsonb("components").$type<string[]>().notNull().default([]),
  kcalMin: integer("kcal_min").notNull(),
  kcalMax: integer("kcal_max").notNull(),
  proteinG: integer("protein_g"),
  carbsG: integer("carbs_g"),
  fatG: integer("fat_g"),
  basePrice: numeric("base_price", { precision: 10, scale: 2 }).notNull(),
  // "none" is the off-switch — discountValue is meaningless (and ignored) when type is "none",
  // rather than modeling percent/flat as two separate nullable columns with an ambiguous
  // both-set case. See lib/pricing/meal-size-discount.ts for the one place this is interpreted.
  discountType: mealSizeDiscountType("discount_type").notNull().default("none"),
  discountValue: numeric("discount_value", { precision: 10, scale: 2 }).notNull().default("0"),
  trial: boolean("trial").notNull().default(false),
  active: boolean("active").notNull().default(true),
  // Client-scoping — see dishes.organizationId for the pattern.
  organizationId: text("organization_id").references(() => organization.id),
});

export const mealSizeItems = pgTable("meal_size_items", {
  ...updatableColumns("msi"),
  // NOT NULL (per M1): a mistyped meal_size_key in a seed subquery must fail the
  // insert loudly rather than silently insert an orphan row.
  mealSizeId: bigint("meal_size_id", { mode: "bigint" })
    .notNull()
    .references(() => mealSizes.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Soft ref to dish_categories.key (no DB FK — see M8/Constraint 7). NOT NULL: every
  // item belongs to a category so checkout can reduce items into per-category counts.
  category: text("category").notNull(),
  // Optional display override for the item label.
  label: text("label"),
  // Each row IS one dish pick — "2 units of a category" is 2 rows, not qty=2 on
  // one. Drives orders.categoryCounts (count of rows per category) and
  // mealSelections.pickIndex (Nth row in sortOrder within the category).
  // Portion size of ONE pick, in tiffin units (TU) — the shared currency swaps move
  // between categories. A category's dishCategories.tuUnitSize/tuUnitLabel converts
  // this into a human amount ("6 roti", "12oz") via lib/menu/format-tu.ts.
  tuAmount: numeric("tu_amount", { precision: 6, scale: 2 }).notNull().default("1"),
  // Cap on this category's TU total once swaps stack more of it in. Null = uncapped
  // (bounded only by the meal size's overall composition). Checked at swap-apply time.
  maxTuAmount: numeric("max_tu_amount", { precision: 6, scale: 2 }),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const addons = pgTable("addons", {
  ...updatableColumns("adn"),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  pricePerWeek: numeric("price_per_week", { precision: 10, scale: 2 }).notNull(),
  active: boolean("active").notNull().default(true),
  // Client-scoping — see dishes.organizationId for the pattern.
  organizationId: text("organization_id").references(() => organization.id),
});

export const deliveryFrequencies = pgTable("delivery_frequencies", {
  ...updatableColumns("frq"),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  daysPerWeek: integer("days_per_week").notNull(),
  courierDiscountPct: integer("courier_discount_pct").notNull().default(0),
  active: boolean("active").notNull().default(true),
  // Client-scoping — see dishes.organizationId for the pattern.
  organizationId: text("organization_id").references(() => organization.id),
});

export const durationPackages = pgTable("duration_packages", {
  ...updatableColumns("dur"),
  weeks: integer("weeks").notNull().unique(),
  discountPct: integer("discount_pct").notNull().default(0),
  // Pause allowance for subscriptions on this package. null = fall back to the app-level default.
  maxPauses: integer("max_pauses"),
  maxPauseDaysTotal: integer("max_pause_days_total"),
  maxPauseStretchDays: integer("max_pause_stretch_days"),
  active: boolean("active").notNull().default(true),
  // Client-scoping — see dishes.organizationId for the pattern.
  organizationId: text("organization_id").references(() => organization.id),
});

export const deliveryZones = pgTable("delivery_zones", {
  ...updatableColumns("zon"),
  name: text("name").notNull().unique(),
  postalPrefixes: text("postal_prefixes").array().notNull(),
  slotWindow: text("slot_window").notNull(),
  active: boolean("active").notNull().default(true),
  // Client-scoping — see dishes.organizationId for the pattern.
  organizationId: text("organization_id").references(() => organization.id),
});

export const pricingTiers = pgTable("pricing_tiers", {
  ...updatableColumns("ptr"),
  minQty: integer("min_qty").notNull(),
  maxQty: integer("max_qty"), // null = unbounded top band
  upliftPct: numeric("uplift_pct", { precision: 5, scale: 2 }).notNull(),
  active: boolean("active").notNull().default(true),
  // Client-scoping — see dishes.organizationId for the pattern.
  organizationId: text("organization_id").references(() => organization.id),
});
