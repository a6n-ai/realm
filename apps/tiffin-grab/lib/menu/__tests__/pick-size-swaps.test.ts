import { describe, expect, it } from "vitest";
import { portionsByCategory } from "@/lib/menu/pick-size";

const items = [
  { category: "sabzi", qty: 2, weightValue: "8.00", weightUnit: "oz" as const, sortOrder: 1 },
  { category: "roti", qty: 4, weightValue: "1.00", weightUnit: "piece" as const, sortOrder: 2 },
  { category: "rice", qty: 1, weightValue: "12.00", weightUnit: "oz" as const, sortOrder: 3 },
];

describe("portionsByCategory with swaps", () => {
  it("is unchanged when no swaps are given", () => {
    const p = portionsByCategory(items);
    expect(p.get("roti")).toEqual(["1 pc", "1 pc", "1 pc", "1 pc"]);
    expect(p.get("rice")).toEqual(["12oz"]);
  });

  it("moves slots and uses the swap's own portion", () => {
    const p = portionsByCategory(items, [
      { fromCategory: "roti", toCategory: "rice", qtyFrom: 2, qtyTo: 1, toWeightValue: "250.00", toWeightUnit: "g" },
    ]);
    expect(p.get("roti")).toEqual(["1 pc", "1 pc"]);
    expect(p.get("rice")).toEqual(["12oz", "250g"]);
  });

  it("falls back to the category's own catalog portion when the swap carries none", () => {
    const p = portionsByCategory(items, [
      { fromCategory: "roti", toCategory: "rice", qtyFrom: 2, qtyTo: 1, toWeightValue: null, toWeightUnit: null },
    ]);
    expect(p.get("rice")).toEqual(["12oz", "12oz"]);
  });

  it("yields a null portion for a category with no catalog line and no swap portion", () => {
    const p = portionsByCategory(items, [
      { fromCategory: "roti", toCategory: "salad", qtyFrom: 1, qtyTo: 1, toWeightValue: null, toWeightUnit: null },
    ]);
    expect(p.get("salad")).toEqual([null]);
  });

  it("never yields negative slots when a swap overdraws", () => {
    const p = portionsByCategory(items, [
      { fromCategory: "rice", toCategory: "roti", qtyFrom: 5, qtyTo: 1, toWeightValue: null, toWeightUnit: null },
    ]);
    expect(p.get("rice")).toEqual([]);
  });
});
