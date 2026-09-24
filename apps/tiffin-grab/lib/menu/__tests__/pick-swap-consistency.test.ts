/**
 * Phase 6.1 / 7 — Pick ↔ Swap quantity consistency for multi-row categories.
 * Give-side TU uses actual composition rows (front-N); never fromPicks × first pickTu.
 */
import { describe, expect, it } from "vitest";
import { computeSwapOption, resultingCategoryTu, validateProposedSwap, type CompositionContext } from "../meal-validation";
import { portionsByCategory } from "../pick-size";
import { groupPickCells } from "../pick-groups";
import type { SwapCategory } from "../swap-rules";
import type { TuCategory } from "../format-tu";
import type { GridCell } from "../meals-grid";

const sabziCat: SwapCategory = {
  key: "sabzi",
  pickTu: 1.5,
  unitType: "weight",
  unitLabel: "oz",
  unitSize: 8,
  maxPicksPerTiffin: null,
};
const daalCat: SwapCategory = {
  key: "daal",
  pickTu: 1.0,
  unitType: "weight",
  unitLabel: "oz",
  unitSize: 8,
  maxPicksPerTiffin: null,
};

const tuMap = new Map<string, TuCategory>([
  ["sabzi", { tuUnitType: "weight", tuUnitSize: 8, tuUnitLabel: "oz" }],
  ["daal", { tuUnitType: "weight", tuUnitSize: 8, tuUnitLabel: "oz" }],
]);

const items = [
  { category: "sabzi", tuAmount: "1.50", sortOrder: 0 },
  { category: "sabzi", tuAmount: "1.00", sortOrder: 1 },
  { category: "daal", tuAmount: "1.00", sortOrder: 2 },
];

const composition: CompositionContext = {
  baseCounts: { sabzi: 2, daal: 1 },
  mealSizeItems: [
    { category: "sabzi", tuAmount: 1.5, maxTuAmount: null, sortOrder: 0 },
    { category: "sabzi", tuAmount: 1.0, maxTuAmount: null, sortOrder: 1 },
    { category: "daal", tuAmount: 1.0, maxTuAmount: null, sortOrder: 2 },
  ],
  categories: new Map([["sabzi", sabziCat], ["daal", daalCat]]),
  labels: { sabzi: "Sabzi", daal: "Daal" },
};

const cell = (pickIndex: number, slot = "sabzi"): GridCell => ({
  day: "mon",
  dateIso: "2026-09-21",
  personIndex: 1,
  selectable: true,
  quantity: 1,
  selectedDishId: `d${pickIndex}`,
  isDefaulted: false,
  dishes: [{ id: `d${pickIndex}`, name: `Dish ${pickIndex}`, image: null }],
  locked: false,
  lockNote: null,
  slot,
  pickIndex,
});

describe("Pick ↔ Swap multi-row Sabzi (1.5 + 1.0 TU)", () => {
  it("Pick groups Choose 2 with 12oz + 8oz without flattening to 2.5 TU", () => {
    const base = portionsByCategory(items, tuMap);
    expect(base.get("sabzi")).toEqual(["12oz", "8oz"]);
    const groups = groupPickCells(
      [cell(1), cell(2)],
      [{ key: "sabzi", label: "Sabzi", selectable: true, sortOrder: 0 }],
      { sabzi: base.get("sabzi")! },
    );
    expect(groups[0]!.chooseCount).toBe(2);
    expect(groups[0]!.portions).toEqual(["12oz", "8oz"]);
    expect(groups[0]!.cells.map((c) => c.pickIndex)).toEqual([1, 2]);
  });

  it("engine uses actual row TU; Pick portions after swap match front-splice remaining slots", () => {
    // Against 1.0 TU daal, same unit is like-for-like: 12oz and 20oz, never a false 24oz bundle.
    const opt = computeSwapOption({
      composition,
      applied: [],
      fromCategory: "sabzi",
      toCategory: "daal",
    });
    expect(opt.validBundles.map((b) => b.getNatural)).toEqual(["12oz", "12oz + 8oz"]);

    // Dividing peer (daal 1.5): 1 pick gives actual 1.5 TU → 1 daal; remaining slot 8oz.
    const evenDaal: SwapCategory = { ...daalCat, pickTu: 1.5 };
    const evenCtx: CompositionContext = {
      ...composition,
      categories: new Map([["sabzi", sabziCat], ["daal", evenDaal]]),
      mealSizeItems: [
        { category: "sabzi", tuAmount: 1.5, maxTuAmount: null, sortOrder: 0 },
        { category: "sabzi", tuAmount: 1.0, maxTuAmount: null, sortOrder: 1 },
        { category: "daal", tuAmount: 1.5, maxTuAmount: null, sortOrder: 2 },
      ],
      baseCounts: { sabzi: 2, daal: 1 },
    };
    const one = validateProposedSwap({
      composition: evenCtx,
      applied: [],
      next: { fromCategory: "sabzi", toCategory: "daal", fromPicks: 1 },
    });
    expect(one).toMatchObject({ ok: true, giveTu: 1.5, qtyTo: 1, getTu: 1.5 });

    const afterOne = portionsByCategory(items, tuMap, [
      { fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: 1 },
    ]);
    expect(afterOne.get("sabzi")).toEqual(["8oz"]);
    expect(resultingCategoryTu(evenCtx, "sabzi", { sabzi: 1 }, [
      { fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: 1 },
    ])).toBe(1.0);

    const groups = groupPickCells(
      [cell(1)],
      [{ key: "sabzi", label: "Sabzi", selectable: true, sortOrder: 0 }],
      { sabzi: afterOne.get("sabzi")! },
    );
    expect(groups[0]!.chooseCount).toBe(1);
    expect(groups[0]!.portions).toEqual(["8oz"]);
  });

  it("offers single-pick bundle and suppresses redundant multi-item bundles when 1 item divides evenly (Rice→Roti style)", () => {
    const rice: SwapCategory = { key: "rice", pickTu: 1, unitType: "count", unitLabel: "rice", unitSize: 1, maxPicksPerTiffin: null };
    const roti: SwapCategory = { key: "roti", pickTu: 0.25, unitType: "count", unitLabel: "roti", unitSize: 4, maxPicksPerTiffin: null };
    const ctx: CompositionContext = {
      baseCounts: { rice: 2, roti: 4 },
      mealSizeItems: [
        { category: "rice", tuAmount: 1, maxTuAmount: null, sortOrder: 0 },
        { category: "rice", tuAmount: 1, maxTuAmount: null, sortOrder: 1 },
        ...Array.from({ length: 4 }, (_, i) => ({ category: "roti", tuAmount: 0.25, maxTuAmount: null, sortOrder: i + 2 })),
      ],
      categories: new Map([["rice", rice], ["roti", roti]]),
    };
    const opt = computeSwapOption({ composition: ctx, applied: [], fromCategory: "rice", toCategory: "roti" });
    expect(opt.validBundles.map((b) => b.fromPicks)).toEqual([1]);
    expect(opt.validBundles[0]?.toPicks).toBe(4);
    expect(opt.validBundles.some((b) => b.fromPicks === 2)).toBe(false);
  });
});
