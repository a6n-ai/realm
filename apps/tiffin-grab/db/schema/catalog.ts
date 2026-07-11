import { updatableColumns } from "@realm/database";
import type { FileDetail } from "@realm/storage/model";
import { bigint, boolean, integer, jsonb, numeric, pgEnum, pgTable, text } from "drizzle-orm/pg-core";

export const mealTier = pgEnum("meal_tier", ["budget", "medium", "premium"]);
export const planType = pgEnum("plan_type", ["tiffin", "healthy"]);
export const dishDiet = pgEnum("dish_diet", ["veg", "nonveg"]);
export const weightUnit = pgEnum("weight_unit", ["oz", "g", "ml", "piece"]);

export const dishes = pgTable("dishes", {
  ...updatableColumns("dsh"),
  name: text("name").notNull(),
  description: text("description"),
  diet: dishDiet("diet").notNull(),
  image: jsonb("image").$type<FileDetail>(),
  // Soft ref to dish_categories.key (no DB FK — key is unique only per (planType, key)).
  // Nullable for back-compat: a null-category dish may be placed in any slot.
  category: text("category"),
  active: boolean("active").notNull().default(true),
});

export const plans = pgTable("plans", {
  ...updatableColumns("pln"),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  planType: planType("plan_type").notNull().default("tiffin"),
  allowedStartDays: text("allowed_start_days").array().notNull().default(["mon", "tue", "wed", "thu", "fri"]),
  active: boolean("active").notNull().default(true),
});

export const mealSizes = pgTable("meal_sizes", {
  ...updatableColumns("msz"),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
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
  trial: boolean("trial").notNull().default(false),
  active: boolean("active").notNull().default(true),
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
  qty: integer("qty").notNull().default(1),
  weightValue: numeric("weight_value", { precision: 6, scale: 2 }),
  weightUnit: weightUnit("weight_unit"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const addons = pgTable("addons", {
  ...updatableColumns("adn"),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  pricePerWeek: numeric("price_per_week", { precision: 10, scale: 2 }).notNull(),
  active: boolean("active").notNull().default(true),
});

export const deliveryFrequencies = pgTable("delivery_frequencies", {
  ...updatableColumns("frq"),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  daysPerWeek: integer("days_per_week").notNull(),
  courierDiscountPct: integer("courier_discount_pct").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const durationPackages = pgTable("duration_packages", {
  ...updatableColumns("dur"),
  weeks: integer("weeks").notNull().unique(),
  discountPct: integer("discount_pct").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const deliveryZones = pgTable("delivery_zones", {
  ...updatableColumns("zon"),
  name: text("name").notNull().unique(),
  postalPrefixes: text("postal_prefixes").array().notNull(),
  slotWindow: text("slot_window").notNull(),
  active: boolean("active").notNull().default(true),
});

export const pricingTiers = pgTable("pricing_tiers", {
  ...updatableColumns("ptr"),
  minQty: integer("min_qty").notNull(),
  maxQty: integer("max_qty"), // null = unbounded top band
  upliftPct: numeric("uplift_pct", { precision: 5, scale: 2 }).notNull(),
  active: boolean("active").notNull().default(true),
});
