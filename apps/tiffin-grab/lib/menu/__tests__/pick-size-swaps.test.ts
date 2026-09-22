import { describe, expect, it } from "vitest";
import { portionsByCategory } from "@/lib/menu/pick-size";
import type { TuCategory } from "@/lib/menu/format-tu";

const items = [
  { category: "sabzi", tuAmount: "1.00", sortOrder: 1 },
  { category: "sabzi", tuAmount: "1.00", sortOrder: 1 },
  { category: "roti", tuAmount: "0.25", sortOrder: 2 },
  { category: "roti", tuAmount: "0.25", sortOrder: 2 },
  { category: "roti", tuAmount: "0.25", sortOrder: 2 },
  { category: "roti", tuAmount: "0.25", sortOrder: 2 },
  { category: "rice", tuAmount: "1.00", sortOrder: 3 },
];

const categories = new Map<string, TuCategory>([
  ["sabzi", { tuUnitType: "weight", tuUnitSize: 8, tuUnitLabel: "oz" }],
  ["roti", { tuUnitType: "count", tuUnitSize: 4, tuUnitLabel: "roti" }],
  ["rice", { tuUnitType: "count", tuUnitSize: 1, tuUnitLabel: "unit" }],
]);

describe("portionsByCategory with swaps", () => {
  it("is unchanged when no swaps are given", () => {
    const p = portionsByCategory(items, categories);
    expect(p.get("roti")).toEqual(["1 roti", "1 roti", "1 roti", "1 roti"]);
    expect(p.get("rice")).toEqual(["1 unit"]);
  });

  it("moves slots and uses the toCategory's own catalog portion", () => {
    const p = portionsByCategory(items, categories, [
      { fromCategory: "roti", toCategory: "rice", qtyFrom: 2, qtyTo: 1 },
    ]);
    expect(p.get("roti")).toEqual(["1 roti", "1 roti"]);
    expect(p.get("rice")).toEqual(["1 unit", "1 unit"]);
  });

  it("yields a null portion for a category with no catalog line", () => {
    const p = portionsByCategory(items, categories, [
      { fromCategory: "roti", toCategory: "salad", qtyFrom: 1, qtyTo: 1 },
    ]);
    expect(p.get("salad")).toEqual([null]);
  });

  it("does not let a swap into an uncatalogued category inherit a PRIOR swap's portion", () => {
    // "salad" has no catalog line, so both swaps into it render null.
    const p = portionsByCategory(items, categories, [
      { fromCategory: "roti", toCategory: "salad", qtyFrom: 1, qtyTo: 1 },
      { fromCategory: "sabzi", toCategory: "salad", qtyFrom: 1, qtyTo: 1 },
    ]);
    expect(p.get("salad")).toEqual([null, null]);
  });

  it("never yields negative slots when a swap overdraws", () => {
    const p = portionsByCategory(items, categories, [
      { fromCategory: "rice", toCategory: "roti", qtyFrom: 5, qtyTo: 1 },
    ]);
    expect(p.get("rice")).toEqual([]);
  });

  it("multi-row Sabzi 1.5+1.0: giving 1 pick removes the first row (actual 1.5 TU)", () => {
    const hetero = [
      { category: "sabzi", tuAmount: "1.50", sortOrder: 0 },
      { category: "sabzi", tuAmount: "1.00", sortOrder: 1 },
      { category: "daal", tuAmount: "1.00", sortOrder: 2 },
    ];
    const cats = new Map<string, TuCategory>([
      ["sabzi", { tuUnitType: "weight", tuUnitSize: 8, tuUnitLabel: "oz" }],
      ["daal", { tuUnitType: "weight", tuUnitSize: 8, tuUnitLabel: "oz" }],
    ]);
    expect(portionsByCategory(hetero, cats).get("sabzi")).toEqual(["12oz", "8oz"]);
    const after = portionsByCategory(hetero, cats, [
      { fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: 1 },
    ]);
    // Front-remove first row (1.5 TU / 12oz); remaining is the 1.0 TU row (=8oz).
    expect(after.get("sabzi")).toEqual(["8oz"]);
    expect(after.get("daal")).toEqual(["8oz", "8oz"]);
  });
});

describe("sumTuForPicks with swaps (kitchen packing rolled qty)", () => {
  it("after giving the 1.5 TU sabzi row, remaining 1 pick sums to 1.0 TU not 1.5", async () => {
    const { sumTuForPicks } = await import("@/lib/menu/pick-size");
    const hetero = [
      { category: "sabzi", tuAmount: "1.50", sortOrder: 0 },
      { category: "sabzi", tuAmount: "1.00", sortOrder: 1 },
    ];
    expect(sumTuForPicks(hetero, "sabzi", 1)).toBe(1.5);
    expect(
      sumTuForPicks(hetero, "sabzi", 1, [{ fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: 1 }]),
    ).toBe(1.0);
    // Never collapse 1.5+1.0 into a single 2.5 when counting two picks without swaps.
    expect(sumTuForPicks(hetero, "sabzi", 2)).toBe(2.5);
  });
});
