import { describe, expect, it } from "vitest";
import { maxQtyBySlot } from "../category-hint";

describe("maxQtyBySlot", () => {
  const planPublicById = new Map([[1n, "pln_veg"], [2n, "pln_nonveg"]]);

  it("takes the max row-count per (category, plan) slot across meal sizes", () => {
    // Small (1n, veg plan): sabzi x1, roti x2. Maharaja (2n, non-veg plan): sabzi x2, roti x4, raita x1.
    const items = [
      { mealSizeId: 1n, category: "sabzi", planId: 1n },
      { mealSizeId: 1n, category: "roti", planId: 1n },
      { mealSizeId: 1n, category: "roti", planId: 1n },
      { mealSizeId: 2n, category: "sabzi", planId: 2n },
      { mealSizeId: 2n, category: "sabzi", planId: 2n },
      { mealSizeId: 2n, category: "roti", planId: 2n },
      { mealSizeId: 2n, category: "roti", planId: 2n },
      { mealSizeId: 2n, category: "roti", planId: 2n },
      { mealSizeId: 2n, category: "roti", planId: 2n },
      { mealSizeId: 2n, category: "raita", planId: 2n },
    ];
    expect(maxQtyBySlot(items, planPublicById)).toEqual({
      "sabzi|pln_veg": 1,
      "roti|pln_veg": 2,
      "sabzi|pln_nonveg": 2,
      "roti|pln_nonveg": 4,
      "raita|pln_nonveg": 1,
    });
  });

  // The whole reason this is slot-keyed, not category-keyed: two items on the SAME meal
  // size can independently target different plans now, so the same category can need a
  // different count per plan even within one meal size.
  it("keeps counts separate when one meal size has items on two different plans", () => {
    const items = [
      { mealSizeId: 1n, category: "sabzi", planId: 1n },
      { mealSizeId: 1n, category: "sabzi", planId: 1n },
      { mealSizeId: 1n, category: "sabzi", planId: 2n },
    ];
    expect(maxQtyBySlot(items, planPublicById)).toEqual({
      "sabzi|pln_veg": 2,
      "sabzi|pln_nonveg": 1,
    });
  });

  it("returns {} for no items", () => {
    expect(maxQtyBySlot([], planPublicById)).toEqual({});
  });
});
