import { describe, expect, it } from "vitest";
import { computeSwapOption, type CompositionContext } from "../meal-validation";
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

describe("Sabzi Only Large (1.5+1.5+1.0) → Daal bundles", () => {
  it("offers which fromPicks divide evenly into daal receive rate", () => {
    // Matches admin: first-row pickTu = 1.5; daal absent → receive rate = sabzi first row 1.5.
    const sabzi = cat("sabzi", 1.5);
    const daalAbsent = cat("daal", null);
    const composition: CompositionContext = {
      mealSizeItems: [
        { category: "sabzi", tuAmount: 1.5, maxTuAmount: null, sortOrder: 0 },
        { category: "sabzi", tuAmount: 1.5, maxTuAmount: null, sortOrder: 1 },
        { category: "sabzi", tuAmount: 1.0, maxTuAmount: null, sortOrder: 2 },
      ],
      baseCounts: { sabzi: 3 },
      categories: new Map([
        ["sabzi", sabzi],
        ["daal", daalAbsent],
      ]),
      labels: { sabzi: "Sabzi", daal: "Daal" },
    };

    const opt = computeSwapOption({
      composition,
      applied: [],
      fromCategory: "sabzi",
      toCategory: "daal",
    });

    // Give 1: 1.5 TU → 1 daal @ 1.5
    // Give 2: 3.0 TU → 2 daal @ 1.5
    // Give 3: 4.0 TU → 4/1.5 not integer → blocked
    expect(opt.available).toBe(true);
    expect(opt.validBundles.map((b) => ({ from: b.fromPicks, to: b.toPicks, give: b.giveNatural, get: b.getNatural }))).toEqual([
      { from: 1, to: 1, give: "12oz", get: "12oz" },
      { from: 2, to: 2, give: "24oz", get: "24oz" },
    ]);
  });

  it("when daal is on the meal at 1.0 TU, give-3 becomes valid (4.0/1.0)", () => {
    const sabzi = cat("sabzi", 1.5);
    const daal = cat("daal", 1.0);
    const composition: CompositionContext = {
      mealSizeItems: [
        { category: "sabzi", tuAmount: 1.5, maxTuAmount: null, sortOrder: 0 },
        { category: "sabzi", tuAmount: 1.5, maxTuAmount: null, sortOrder: 1 },
        { category: "sabzi", tuAmount: 1.0, maxTuAmount: null, sortOrder: 2 },
        { category: "daal", tuAmount: 1.0, maxTuAmount: null, sortOrder: 3 },
      ],
      baseCounts: { sabzi: 3, daal: 0 },
      categories: new Map([
        ["sabzi", sabzi],
        ["daal", daal],
      ]),
      labels: { sabzi: "Sabzi", daal: "Daal" },
    };

    const opt = computeSwapOption({
      composition,
      applied: [],
      fromCategory: "sabzi",
      toCategory: "daal",
    });

    // Give 1: 1.5/1.0 not integer → blocked
    // Give 2: 3.0/1.0 → 3 daal
    // Give 3: 4.0/1.0 → 4 daal
    expect(opt.validBundles.map((b) => b.fromPicks)).toEqual([2, 3]);
  });
});
