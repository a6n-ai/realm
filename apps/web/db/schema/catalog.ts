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
