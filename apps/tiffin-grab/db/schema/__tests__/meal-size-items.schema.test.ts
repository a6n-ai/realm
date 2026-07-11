import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { mealSizeItems, mealSizes, weightUnit } from "../catalog";

describe("meal_size_items schema", () => {
  it("has the msi base columns plus the item fields", () => {
    const columns = getTableColumns(mealSizeItems);
    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        "id",
        "publicId",
        "appId",
        "createdAt",
        "updatedAt",
        "createdBy",
        "updatedBy",
        "mealSizeId",
        "name",
        "qty",
        "weightValue",
        "weightUnit",
        "sortOrder",
      ]),
    );
  });

  it("requires mealSizeId (M1: no silent orphan rows)", () => {
    expect(mealSizeItems.mealSizeId.notNull).toBe(true);
  });
});

describe("meal_sizes.trial", () => {
  it("has a trial column", () => {
    const columns = getTableColumns(mealSizes);
    expect(Object.keys(columns)).toContain("trial");
  });
});

describe("weight_unit enum", () => {
  it("has the exact 4 units", () => {
    expect(weightUnit.enumValues).toEqual(["oz", "g", "ml", "piece"]);
  });
});
