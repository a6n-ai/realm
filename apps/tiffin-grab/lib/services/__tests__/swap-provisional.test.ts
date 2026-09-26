import { describe, expect, it } from "vitest";
import { computeAllSwapOptions, validateProposedSwap, type CompositionContext } from "../../menu/meal-validation";
import type { SwapCategory, SwapRow } from "../../menu/swap-rules";
import { portionsByCategory } from "../../menu/pick-size";
import type { TuCategory } from "../../menu/format-tu";

describe("Dynamic provisional swap generation", () => {
  const sabziCat: SwapCategory = { key: "sabzi", pickTu: 1.5, unitType: "weight", unitLabel: "oz", unitSize: 8, maxPicksPerTiffin: null };
  const daalCat: SwapCategory = { key: "daal", pickTu: 1.0, unitType: "weight", unitLabel: "oz", unitSize: 8, maxPicksPerTiffin: null };
  const riceCat: SwapCategory = { key: "rice", pickTu: 1.0, unitType: "weight", unitLabel: "oz", unitSize: 8, maxPicksPerTiffin: null };

  const tuMap = new Map<string, TuCategory>([
    ["sabzi", { tuUnitType: "weight", tuUnitSize: 8, tuUnitLabel: "oz" }],
    ["daal", { tuUnitType: "weight", tuUnitSize: 8, tuUnitLabel: "oz" }],
    ["rice", { tuUnitType: "weight", tuUnitSize: 8, tuUnitLabel: "oz" }],
  ]);

  const items = [
    { category: "sabzi", tuAmount: 1.50, maxTuAmount: null, sortOrder: 0 },
    { category: "sabzi", tuAmount: 1.00, maxTuAmount: null, sortOrder: 1 },
    { category: "sabzi", tuAmount: 0.50, maxTuAmount: null, sortOrder: 2 },
    { category: "daal", tuAmount: 1.50, maxTuAmount: null, sortOrder: 3 },
    { category: "rice", tuAmount: 1.00, maxTuAmount: null, sortOrder: 4 },
  ];

  const composition: CompositionContext = {
    baseCounts: { sabzi: 3, daal: 1, rice: 1 },
    mealSizeItems: items,
    categories: new Map([["sabzi", sabziCat], ["daal", daalCat], ["rice", riceCat]]),
    labels: { sabzi: "Sabzi", daal: "Daal", rice: "Rice" },
  };

  it("Test 1 & 2: Provisional swap removes 12oz, leaving 8oz to get its own valid options", () => {
    // Base options without pending swaps
    const baseOpts = computeAllSwapOptions({
      composition,
      applied: [],
      pairs: [{ fromCategory: "sabzi", toCategory: "daal" }],
    });
    // First sabzi is 12oz (1.5 TU)
    expect(baseOpts[0]!.validBundles[0]?.getNatural).toBe("12oz");

    // With a pending swap of 1 sabzi
    const pendingApplies: SwapRow[] = [{ fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: 1 }];
    const dynamicOpts = computeAllSwapOptions({
      composition,
      applied: pendingApplies,
      pairs: [{ fromCategory: "sabzi", toCategory: "daal" }],
    });

    // The remaining sabzi is 8oz (1.0 TU), so the swap option should dynamically target 8oz
    expect(dynamicOpts[0]!.validBundles[0]?.getNatural).toBe("8oz");
    expect(dynamicOpts[0]!.giveNatural).toBe("8oz");
  });

  it("Test 3: Multiple pending swaps compute against combined state", () => {
    const pendingApplies: SwapRow[] = [
      { fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: 1 }, // takes 12oz
      { fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: 1 }, // takes 8oz
    ];
    const dynamicOpts = computeAllSwapOptions({
      composition,
      applied: pendingApplies,
      pairs: [{ fromCategory: "sabzi", toCategory: "daal" }],
    });

    // The third sabzi is 4oz (0.5 TU)
    expect(dynamicOpts[0]!.validBundles[0]?.getNatural).toBe("4oz");
    expect(dynamicOpts[0]!.giveNatural).toBe("4oz");
  });

  it("Test 4: Undo a swap restores the correct previous state", () => {
    // First swap 12oz
    let pendingApplies: SwapRow[] = [{ fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: 1 }];
    // Undo it -> back to empty
    pendingApplies = [];
    const revertedOpts = computeAllSwapOptions({
      composition,
      applied: pendingApplies,
      pairs: [{ fromCategory: "sabzi", toCategory: "daal" }],
    });
    // Back to 12oz
    expect(revertedOpts[0]!.validBundles[0]?.getNatural).toBe("12oz");
  });
});
