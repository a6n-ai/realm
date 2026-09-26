import { describe, expect, it } from "vitest";
import { computeSwapOption, slotsAfterSwaps, validateProposedSwap, type CompositionContext } from "../meal-validation";
import { portionsByCategory, sumTuForPicks } from "../pick-size";
import type { TuCategory } from "../format-tu";
import type { SwapCategory } from "../swap-rules";
import { previewOverride, type PreviewBase } from "../pick-preview";

const cat = (key: string, pickTu: number): SwapCategory => ({
  key, pickTu, unitType: "weight", unitLabel: "oz", maxPicksPerTiffin: null, unitSize: 8,
});

// Sabzi 12oz, Daal 12oz, Daal 8oz. Pair Daal → Sabzi overrides 12oz → 8oz only.
const composition: CompositionContext = {
  mealSizeItems: [
    { category: "sabzi", tuAmount: 1.5, maxTuAmount: null, sortOrder: 0 },
    { category: "daal", tuAmount: 1.5, maxTuAmount: null, sortOrder: 1 },
    { category: "daal", tuAmount: 1.0, maxTuAmount: null, sortOrder: 2 },
  ],
  baseCounts: { sabzi: 1, daal: 2 },
  categories: new Map([["sabzi", cat("sabzi", 1.5)], ["daal", cat("daal", 1.5)]]),
  labels: { sabzi: "Sabzi", daal: "Daal" },
};
const overrides = [{ giveTu: 1.5, receiveTu: 1 }];
const daalToSabzi = { fromCategory: "daal", toCategory: "sabzi", fromPicks: 1 };

describe("exchange overrides at apply time", () => {
  it("a 12oz Daal buys an 8oz Sabzi", () => {
    const r = validateProposedSwap({ composition, applied: [], next: { ...daalToSabzi, fromRow: 0 }, overrides });
    expect(r).toMatchObject({ ok: true, qtyTo: 1, giveTu: 1.5, getTu: 1, receiveTu: 1 });
  });

  it("an 8oz Daal has no line, so it stays 8oz", () => {
    const r = validateProposedSwap({ composition, applied: [], next: { ...daalToSabzi, fromRow: 1 }, overrides });
    expect(r).toMatchObject({ ok: true, qtyTo: 1, giveTu: 1, getTu: 1, receiveTu: null });
  });

  it("no overrides behaves exactly as before", () => {
    const r = validateProposedSwap({ composition, applied: [], next: { ...daalToSabzi, fromRow: 0 } });
    expect(r).toMatchObject({ ok: true, qtyTo: 1, giveTu: 1.5, getTu: 1.5, receiveTu: null });
  });

  it("refuses a bundle whose portions resolve to different sizes", () => {
    const r = validateProposedSwap({ composition, applied: [], next: { ...daalToSabzi, fromPicks: 2 }, overrides });
    expect(r).toEqual({ ok: false, reason: "Swap one item at a time." });
  });

  it("the option reads the overridden size", () => {
    const o = computeSwapOption({ composition, applied: [], fromCategory: "daal", toCategory: "sabzi", overrides });
    expect(o.validBundles[0]).toMatchObject({ fromPicks: 1, toPicks: 1, giveNatural: "12oz", getNatural: "8oz", receiveTu: 1 });
  });

  it("the Max TU cap counts the overridden amount", () => {
    const capped: CompositionContext = {
      ...composition,
      mealSizeItems: composition.mealSizeItems.map((i) => (i.category === "sabzi" ? { ...i, maxTuAmount: 2.5 } : i)),
    };
    // Natural 12oz would make 3 TU of Sabzi (over 2.5); the 8oz override makes 2.5.
    expect(validateProposedSwap({ composition: capped, applied: [], next: { ...daalToSabzi, fromRow: 0 } }).ok).toBe(false);
    expect(validateProposedSwap({ composition: capped, applied: [], next: { ...daalToSabzi, fromRow: 0 }, overrides }).ok).toBe(true);
  });

  it("a stored receiveTu sizes the received pick in every fold", () => {
    const applied = [{ fromCategory: "daal", toCategory: "sabzi", qtyFrom: 1, qtyTo: 1, fromRow: 0, receiveTu: 1 }];
    expect(slotsAfterSwaps(composition, applied).get("sabzi")).toEqual([1.5, 1]);
    const items = composition.mealSizeItems.map((i) => ({ category: i.category, tuAmount: String(i.tuAmount), sortOrder: i.sortOrder }));
    const tu = new Map<string, TuCategory>([
      ["sabzi", { tuUnitType: "weight", tuUnitSize: 8, tuUnitLabel: "oz", selectable: true }],
      ["daal", { tuUnitType: "weight", tuUnitSize: 8, tuUnitLabel: "oz", selectable: true }],
    ]);
    expect(portionsByCategory(items, tu, applied).get("sabzi")).toEqual(["12oz", "8oz"]);
    expect(portionsByCategory(items, tu, applied).get("daal")).toEqual(["8oz"]);
    // Kitchen packing sheet totals go through sumTuForPicks with the same rows.
    expect(sumTuForPicks(items, "sabzi", 2, applied, tu)).toBe(2.5);
  });
});

describe("Edit meal sizes a pending swap by its own row", () => {
  const base: PreviewBase = {
    items: composition.mealSizeItems.map((i) => ({ category: i.category, tuAmount: String(i.tuAmount), sortOrder: i.sortOrder })),
    tu: [],
    appliedByDate: {},
    composition: { ...composition, categories: [...composition.categories] },
    pairs: [{ fromCategory: "daal", toCategory: "sabzi", exchangeOverrides: overrides }],
  };
  const next = (fromRow: number) => ({ ...daalToSabzi, fromRow });

  it("the 12oz Daal row gets the override, the 8oz row stays natural", () => {
    expect(previewOverride(base, "2026-10-05", [], next(0))).toEqual({ receiveTu: 1, qtyTo: 1 });
    expect(previewOverride(base, "2026-10-05", [], next(1))).toBeNull();
  });

  it("a pair with no overrides never touches the pending swap", () => {
    expect(previewOverride({ ...base, pairs: [{ fromCategory: "daal", toCategory: "sabzi" }] }, "2026-10-05", [], next(0))).toBeNull();
  });
});
