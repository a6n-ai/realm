import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { customMealPricing, mealSizes } from "@/db/schema";

describe("custom meal schema", () => {
  it("meal_sizes carries custom + composition_key with a partial unique index", () => {
    const cfg = getTableConfig(mealSizes);
    expect(cfg.columns.map((c) => c.name)).toEqual(expect.arrayContaining(["custom", "composition_key"]));
    const idx = cfg.indexes.find((i) => i.config.name === "meal_sizes_composition_key_unique");
    expect(idx?.config.unique).toBe(true);
    expect(idx?.config.where).toBeDefined();
  });

  it("custom_meal_pricing is unique per (category, plan)", () => {
    const cfg = getTableConfig(customMealPricing);
    expect(cfg.name).toBe("custom_meal_pricing");
    const idx = cfg.indexes.find((i) => i.config.name === "custom_meal_pricing_category_plan_unique");
    expect(idx?.config.unique).toBe(true);
  });
});
