import { describe, expect, it } from "vitest";
import { firstBrokenSwap, slotsAfterSwaps, validateProposedSwap, type CompositionContext } from "../meal-validation";
import { portionsByCategory } from "../pick-size";
import type { TuCategory } from "../format-tu";
import type { SwapCategory } from "../swap-rules";

const cat = (key: string, pickTu: number): SwapCategory => ({
  key, pickTu, unitType: "weight", unitLabel: "oz", maxPicksPerTiffin: null, unitSize: 8,
});

// Maharaja Thali: Sabzi 12oz (row 0), Daal 12oz, Sabzi 8oz (row 1).
const composition: CompositionContext = {
  mealSizeItems: [
    { category: "sabzi", tuAmount: 1.5, maxTuAmount: null, sortOrder: 0 },
    { category: "daal", tuAmount: 1.5, maxTuAmount: null, sortOrder: 1 },
    { category: "sabzi", tuAmount: 1.0, maxTuAmount: null, sortOrder: 2 },
  ],
  baseCounts: { sabzi: 2, daal: 1 },
  categories: new Map([["sabzi", cat("sabzi", 1.5)], ["daal", cat("daal", 1.5)]]),
  labels: { sabzi: "Sabzi", daal: "Daal" },
};
const items = composition.mealSizeItems.map((i) => ({ category: i.category, tuAmount: String(i.tuAmount), sortOrder: i.sortOrder }));
const tu = new Map<string, TuCategory>([
  ["sabzi", { tuUnitType: "weight", tuUnitSize: 8, tuUnitLabel: "oz", selectable: true }],
  ["daal", { tuUnitType: "weight", tuUnitSize: 8, tuUnitLabel: "oz", selectable: false }],
]);
const eight = { fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: 1, fromRow: 1 };

describe("swapping a named composition row", () => {
  it("gives up the 8oz Sabzi, not the 12oz, everywhere the kitchen reads portions", () => {
    const p = portionsByCategory(items, tu, [eight]);
    expect(p.get("sabzi")).toEqual(["12oz"]);
    expect(p.get("daal")).toEqual(["12oz", "8oz"]);
    expect(slotsAfterSwaps(composition, [eight]).get("sabzi")).toEqual([1.5]);
  });

  it("keeps the old leading-row behaviour when no row is named", () => {
    const p = portionsByCategory(items, tu, [{ ...eight, fromRow: null }]);
    expect(p.get("sabzi")).toEqual(["8oz"]);
    expect(p.get("daal")).toEqual(["12oz", "12oz"]);
  });

  it("lets either Sabzi go first, then the other", () => {
    const first = validateProposedSwap({ composition, applied: [], next: { fromCategory: "sabzi", toCategory: "daal", fromPicks: 1, fromRow: 1 } });
    expect(first).toMatchObject({ ok: true, qtyTo: 1, giveTu: 1 });
    const second = validateProposedSwap({ composition, applied: [eight], next: { fromCategory: "sabzi", toCategory: "daal", fromPicks: 1, fromRow: 0 } });
    expect(second).toMatchObject({ ok: true, giveTu: 1.5 });
  });

  it("refuses a row that is already swapped", () => {
    const r = validateProposedSwap({ composition, applied: [eight], next: { fromCategory: "sabzi", toCategory: "daal", fromPicks: 1, fromRow: 1 } });
    expect(r).toEqual({ ok: false, reason: "That Sabzi is already swapped on this day." });
  });
});

describe("firstBrokenSwap (removing a swap others stack on)", () => {
  // Salad only reaches the meal through a Daal → Salad swap.
  const withSalad: CompositionContext = {
    ...composition,
    categories: new Map([...composition.categories, ["salad", cat("salad", 1.0)]]),
  };
  const sabziToDaal = { fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: 1 };
  const daalToSalad = { fromCategory: "daal", toCategory: "salad", qtyFrom: 2, qtyTo: 2 };

  it("is fine while the swap it builds on is there", () => {
    expect(firstBrokenSwap(withSalad, [sabziToDaal, daalToSalad])).toBeNull();
  });

  it("flags the stacked swap once the one it used is gone", () => {
    expect(firstBrokenSwap(withSalad, [daalToSalad])).toBe(daalToSalad);
  });

  it("flags a named row that another swap already took", () => {
    expect(firstBrokenSwap(composition, [eight, eight])).toBe(eight);
  });
});
