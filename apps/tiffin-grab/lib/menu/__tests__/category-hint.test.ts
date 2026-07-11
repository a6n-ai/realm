import { describe, expect, it } from "vitest";
import { maxQtyByCategory } from "../category-hint";

describe("maxQtyByCategory", () => {
  it("takes the max qty per category across meal sizes of the same plan_type", () => {
    // Small: sabzi=1, roti=2. Maharaja: sabzi=2, roti=4, raita=1.
    const items = [
      { category: "sabzi", qty: 1 },
      { category: "roti", qty: 2 },
      { category: "sabzi", qty: 2 },
      { category: "roti", qty: 4 },
      { category: "raita", qty: 1 },
    ];
    expect(maxQtyByCategory(items)).toEqual({ sabzi: 2, roti: 4, raita: 1 });
  });

  it("returns {} for no items", () => {
    expect(maxQtyByCategory([])).toEqual({});
  });
});
