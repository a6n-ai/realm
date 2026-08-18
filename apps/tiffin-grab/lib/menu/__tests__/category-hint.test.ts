import { describe, expect, it } from "vitest";
import { maxQtyByCategory } from "../category-hint";

describe("maxQtyByCategory", () => {
  it("takes the max row-count per category across meal sizes of the same plan_type", () => {
    // Small (1n): sabzi x1, roti x2. Maharaja (2n): sabzi x2, roti x4, raita x1.
    const items = [
      { mealSizeId: 1n, category: "sabzi" },
      { mealSizeId: 1n, category: "roti" },
      { mealSizeId: 1n, category: "roti" },
      { mealSizeId: 2n, category: "sabzi" },
      { mealSizeId: 2n, category: "sabzi" },
      { mealSizeId: 2n, category: "roti" },
      { mealSizeId: 2n, category: "roti" },
      { mealSizeId: 2n, category: "roti" },
      { mealSizeId: 2n, category: "roti" },
      { mealSizeId: 2n, category: "raita" },
    ];
    expect(maxQtyByCategory(items)).toEqual({ sabzi: 2, roti: 4, raita: 1 });
  });

  it("returns {} for no items", () => {
    expect(maxQtyByCategory([])).toEqual({});
  });
});
