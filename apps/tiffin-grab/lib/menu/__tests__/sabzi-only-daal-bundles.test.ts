import { describe, expect, it } from "vitest";
import { computeSwapOption, slotsAfterSwaps, validateProposedSwap, type CompositionContext } from "../meal-validation";
import { portionsByCategory } from "../pick-size";
import type { SwapCategory } from "../swap-rules";

const cat = (key: string, pickTu: number | null, over: Partial<SwapCategory> = {}): SwapCategory => ({
  key,
  pickTu,
  unitType: "weight",
  unitLabel: "oz",
  maxPicksPerTiffin: null,
  unitSize: 8,
  ...over,
});

// Prod sabzi_only_large: Sabzi 12oz, Daal 12oz, Sabzi 8oz. No Salad row.
const composition: CompositionContext = {
  mealSizeItems: [
    { category: "sabzi", tuAmount: 1.5, maxTuAmount: null, sortOrder: 0 },
    { category: "daal", tuAmount: 1.5, maxTuAmount: null, sortOrder: 1 },
    { category: "sabzi", tuAmount: 1.0, maxTuAmount: null, sortOrder: 2 },
  ],
  baseCounts: { sabzi: 2, daal: 1 },
  categories: new Map([
    ["sabzi", cat("sabzi", 1.5)],
    ["daal", cat("daal", 1.5)],
    ["salad", cat("salad", null)],
  ]),
  labels: { sabzi: "Sabzi", daal: "Daal", salad: "Salad" },
};

describe("Sabzi Only Large → Daal (like-for-like TU)", () => {
  it("offers give-1 and give-2; each Daal keeps the given Sabzi size", () => {
    const opt = computeSwapOption({ composition, applied: [], fromCategory: "sabzi", toCategory: "daal" });
    expect(opt.validBundles.map((b) => ({ from: b.fromPicks, to: b.toPicks, give: b.giveNatural, get: b.getNatural }))).toEqual([
      { from: 1, to: 1, give: "12oz", get: "12oz" },
      { from: 2, to: 2, give: "12oz + 8oz", get: "12oz + 8oz" },
    ]);
  });

  it("swapping both gives Daal 12oz + 12oz + 8oz", () => {
    const applied = [{ fromCategory: "sabzi", toCategory: "daal", qtyFrom: 2, qtyTo: 2 }];
    expect(slotsAfterSwaps(composition, applied).get("daal")).toEqual([1.5, 1.5, 1.0]);
    const cats = new Map([["sabzi", { tuUnitType: "weight" as const, tuUnitSize: 8, tuUnitLabel: "oz" }], ["daal", { tuUnitType: "weight" as const, tuUnitSize: 8, tuUnitLabel: "oz" }]]);
    const items = composition.mealSizeItems.map((i) => ({ category: i.category, tuAmount: String(i.tuAmount), sortOrder: i.sortOrder }));
    expect(portionsByCategory(items, cats, applied).get("daal")).toEqual(["12oz", "12oz", "8oz"]);
  });

  it("one at a time reaches the same meal: the 8oz Sabzi swaps after the 12oz", () => {
    const first = [{ fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: 1 }];
    const second = validateProposedSwap({ composition, applied: first, next: { fromCategory: "sabzi", toCategory: "daal", fromPicks: 1 } });
    expect(second).toMatchObject({ ok: true, qtyTo: 1, giveTu: 1.0, getTu: 1.0 });
    const both = [...first, { fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: 1 }];
    expect(slotsAfterSwaps(composition, both).get("daal")).toEqual([1.5, 1.5, 1.0]);
  });

  it("can't swap into a category the meal size has no row for", () => {
    const r = validateProposedSwap({ composition, applied: [], next: { fromCategory: "sabzi", toCategory: "salad", fromPicks: 1 } });
    expect(r.ok).toBe(false);
    expect(computeSwapOption({ composition, applied: [], fromCategory: "sabzi", toCategory: "salad" }).available).toBe(false);
  });
});
