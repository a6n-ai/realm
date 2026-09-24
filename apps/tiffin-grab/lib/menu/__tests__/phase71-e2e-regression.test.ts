/**
 * Phase 7.1 — End-to-end regression matrix for the shared swap engine.
 * Pure composition tests: options path (computeSwapOption) must agree with
 * apply path (validateProposedSwap). No UI / architecture changes.
 */
import { describe, expect, it } from "vitest";
import {
  computeSwapOption,
  resultingCategoryTu,
  slotsAfterSwaps,
  validateMealRules,
  validateProposedSwap,
  type CompositionContext,
} from "../meal-validation";
import { portionsByCategory } from "../pick-size";
import { groupPickCells } from "../pick-groups";
import type { SwapCategory, SwapRow } from "../swap-rules";
import type { TuCategory } from "../format-tu";
import { tuToNatural } from "../format-tu";
import type { GridCell } from "../meals-grid";

const cat = (key: string, pickTu: number | null, over: Partial<SwapCategory> = {}): SwapCategory => ({
  key,
  pickTu,
  unitType: "weight",
  unitLabel: "oz",
  maxPicksPerTiffin: null,
  unitSize: 8,
  ...over,
});

function ctx(over: Partial<CompositionContext> & Pick<CompositionContext, "baseCounts" | "mealSizeItems" | "categories">): CompositionContext {
  return { labels: { sabzi: "Sabzi", daal: "Daal", rice: "Rice", roti: "Roti" }, ...over };
}

/** Options and apply must agree for every offered bundle (and omit the same invalids). */
function assertOptionsMatchApply(composition: CompositionContext, from: string, to: string, applied: SwapRow[] = []) {
  const opt = computeSwapOption({ composition, applied, fromCategory: from, toCategory: to });
  for (const b of opt.validBundles) {
    const r = validateProposedSwap({
      composition,
      applied,
      next: { fromCategory: from, toCategory: to, fromPicks: b.fromPicks },
    });
    expect(r.ok, `apply should accept options bundle fromPicks=${b.fromPicks}`).toBe(true);
    if (r.ok) {
      expect(r.qtyTo).toBe(b.toPicks);
    }
  }
  const slots = slotsAfterSwaps(composition, applied).get(from) ?? [];
  const offered = new Set(opt.validBundles.map((b) => b.fromPicks));
  for (let q = 1; q <= slots.length; q++) {
    if (offered.has(q)) continue;
    const r = validateProposedSwap({
      composition,
      applied,
      next: { fromCategory: from, toCategory: to, fromPicks: q },
    });
    expect(r.ok, `apply must reject fromPicks=${q} when options omit it`).toBe(false);
  }
  return opt;
}

const cell = (pickIndex: number): GridCell => ({
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
  slot: "sabzi",
  pickIndex,
});

describe("Phase 7.1 Case A — single-row compatibility", () => {
  const composition = ctx({
    baseCounts: { sabzi: 1, daal: 1 },
    mealSizeItems: [
      { category: "sabzi", tuAmount: 1.5, maxTuAmount: null, sortOrder: 0 },
      { category: "daal", tuAmount: 1.5, maxTuAmount: null, sortOrder: 1 },
    ],
    categories: new Map([
      ["sabzi", cat("sabzi", 1.5)],
      ["daal", cat("daal", 1.5)],
    ]),
  });

  it("1→1 / 12oz→12oz; options agree with apply; remaining state after apply", () => {
    const opt = assertOptionsMatchApply(composition, "sabzi", "daal");
    expect(opt.validBundles).toEqual([
      expect.objectContaining({ fromPicks: 1, toPicks: 1, giveNatural: "12oz", getNatural: "12oz" }),
    ]);
    const applied: SwapRow[] = [{ fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: 1 }];
    expect(resultingCategoryTu(composition, "sabzi", { sabzi: 0, daal: 2 }, applied)).toBe(0);
    expect(resultingCategoryTu(composition, "daal", { sabzi: 0, daal: 2 }, applied)).toBe(3.0);
    const next = computeSwapOption({ composition, applied, fromCategory: "sabzi", toCategory: "daal" });
    expect(next.available).toBe(false);
  });
});

describe("Phase 7.1 Case B — same-TU multi-row", () => {
  const composition = ctx({
    baseCounts: { sabzi: 2, daal: 1 },
    mealSizeItems: [
      { category: "sabzi", tuAmount: 1.5, maxTuAmount: null, sortOrder: 0 },
      { category: "sabzi", tuAmount: 1.5, maxTuAmount: null, sortOrder: 1 },
      { category: "daal", tuAmount: 1.5, maxTuAmount: null, sortOrder: 2 },
    ],
    categories: new Map([
      ["sabzi", cat("sabzi", 1.5)],
      ["daal", cat("daal", 1.5)],
    ]),
  });

  it("Choose 2, total 3.0 TU / 24oz, not flattened; options≡apply", () => {
    expect(resultingCategoryTu(composition, "sabzi", { sabzi: 2 })).toBe(3.0);
    expect(tuToNatural({ tuUnitType: "weight", tuUnitSize: 8, tuUnitLabel: "oz" }, 3)).toBe(24);
    const tu = new Map<string, TuCategory>([["sabzi", { tuUnitType: "weight", tuUnitSize: 8, tuUnitLabel: "oz" }]]);
    const portions = portionsByCategory(
      [
        { category: "sabzi", tuAmount: "1.50", sortOrder: 0 },
        { category: "sabzi", tuAmount: "1.50", sortOrder: 1 },
      ],
      tu,
    );
    const groups = groupPickCells(
      [cell(1), cell(2)],
      [{ key: "sabzi", label: "Sabzi", selectable: true, sortOrder: 0 }],
      { sabzi: portions.get("sabzi")! },
    );
    expect(groups[0]!.chooseCount).toBe(2);
    expect(groups[0]!.portions).toEqual(["12oz", "12oz"]);
    const opt = assertOptionsMatchApply(composition, "sabzi", "daal");
    expect(opt.validBundles.map((b) => [b.fromPicks, b.toPicks, b.giveNatural])).toEqual([
      [1, 1, "12oz"],
      [2, 2, "24oz"],
    ]);
  });
});

describe("Phase 7.1 Case C — different-TU multi-row", () => {
  const composition = ctx({
    baseCounts: { sabzi: 2, daal: 1 },
    mealSizeItems: [
      { category: "sabzi", tuAmount: 1.5, maxTuAmount: null, sortOrder: 0 },
      { category: "sabzi", tuAmount: 1.0, maxTuAmount: null, sortOrder: 1 },
      { category: "daal", tuAmount: 0.5, maxTuAmount: null, sortOrder: 2 },
    ],
    categories: new Map([
      ["sabzi", cat("sabzi", 1.5)],
      ["daal", cat("daal", 0.5)],
    ]),
  });

  it("1.5+1.0 = 2.5 TU = 20oz, never 3 TU / 24oz", () => {
    expect(resultingCategoryTu(composition, "sabzi", { sabzi: 2 })).toBe(2.5);
    expect(tuToNatural({ tuUnitType: "weight", tuUnitSize: 8, tuUnitLabel: "oz" }, 2.5)).toBe(20);
  });

  it("C1/C2/C3 give TU + options≡apply; kitchen portions match front-remove", () => {
    const opt = assertOptionsMatchApply(composition, "sabzi", "daal");
    expect(opt.validBundles.find((b) => b.fromPicks === 1)).toMatchObject({
      giveNatural: "12oz",
      toPicks: 1,
      getNatural: "12oz",
    });
    expect(opt.validBundles.find((b) => b.fromPicks === 2)).toMatchObject({
      giveNatural: "12oz + 8oz",
      toPicks: 2,
      getNatural: "12oz + 8oz",
    });
    expect(opt.validBundles.some((b) => b.giveNatural === "24oz")).toBe(false);

    // C1
    const c1 = validateProposedSwap({
      composition,
      applied: [],
      next: { fromCategory: "sabzi", toCategory: "daal", fromPicks: 1 },
    });
    expect(c1).toMatchObject({ ok: true, giveTu: 1.5 });

    // C2 after C1
    const afterC1: SwapRow[] = [{ fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: 1 }];
    expect(resultingCategoryTu(composition, "sabzi", { sabzi: 1 }, afterC1)).toBe(1.0);
    const c2 = validateProposedSwap({
      composition,
      applied: afterC1,
      next: { fromCategory: "sabzi", toCategory: "daal", fromPicks: 1 },
    });
    expect(c2).toMatchObject({ ok: true, giveTu: 1.0 });

    // C3 both at once
    const c3 = validateProposedSwap({
      composition,
      applied: [],
      next: { fromCategory: "sabzi", toCategory: "daal", fromPicks: 2 },
    });
    expect(c3).toMatchObject({ ok: true, giveTu: 2.5 });

    // Kitchen/pick portions after C1
    const after = portionsByCategory(
      [
        { category: "sabzi", tuAmount: "1.50", sortOrder: 0 },
        { category: "sabzi", tuAmount: "1.00", sortOrder: 1 },
        { category: "daal", tuAmount: "0.50", sortOrder: 2 },
      ],
      new Map([
        ["sabzi", { tuUnitType: "weight" as const, tuUnitSize: 8, tuUnitLabel: "oz" }],
        ["daal", { tuUnitType: "weight" as const, tuUnitSize: 8, tuUnitLabel: "oz" }],
      ]),
      afterC1,
    );
    expect(after.get("sabzi")).toEqual(["8oz"]);
    expect(slotsAfterSwaps(composition, afterC1).get("sabzi")).toEqual([1.0]);
  });
});

describe("Phase 7.1 Case E — Swap → Swap sequential", () => {
  it("second options use post-first-swap meal; Max TU on final state", () => {
    const composition = ctx({
      baseCounts: { sabzi: 2, daal: 1 },
      mealSizeItems: [
        { category: "sabzi", tuAmount: 1.5, maxTuAmount: null, sortOrder: 0 },
        { category: "sabzi", tuAmount: 1.5, maxTuAmount: 4, sortOrder: 1 },
        { category: "daal", tuAmount: 1.5, maxTuAmount: 3, sortOrder: 2 },
      ],
      categories: new Map([
        ["sabzi", cat("sabzi", 1.5)],
        ["daal", cat("daal", 1.5)],
      ]),
    });
    const first = validateProposedSwap({
      composition,
      applied: [],
      next: { fromCategory: "sabzi", toCategory: "daal", fromPicks: 1 },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const applied: SwapRow[] = [{ fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: first.qtyTo }];
    // After +1.5 daal → daal TU = 1.5+1.5 = 3.0 at Max TU=3; another sabzi→daal must fail.
    const secondOpt = computeSwapOption({ composition, applied, fromCategory: "sabzi", toCategory: "daal" });
    expect(secondOpt.available).toBe(false);
    const second = validateProposedSwap({
      composition,
      applied,
      next: { fromCategory: "sabzi", toCategory: "daal", fromPicks: 1 },
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toMatch(/maximum Daal/i);
  });
});

describe("Phase 7.1 Case H — Max Picks", () => {
  it("options and apply both reject over-cap destination picks", () => {
    const composition = ctx({
      baseCounts: { sabzi: 2, daal: 1 },
      mealSizeItems: [
        { category: "sabzi", tuAmount: 1, maxTuAmount: null, sortOrder: 0 },
        { category: "sabzi", tuAmount: 1, maxTuAmount: null, sortOrder: 1 },
        { category: "daal", tuAmount: 1, maxTuAmount: null, sortOrder: 2 },
      ],
      categories: new Map([
        ["sabzi", cat("sabzi", 1)],
        ["daal", cat("daal", 1, { maxPicksPerTiffin: 2 })],
      ]),
    });
    // 1 sabzi→daal → daal count 2 (at cap); 2 sabzi→daal → daal count 3 (over).
    const opt = computeSwapOption({ composition, applied: [], fromCategory: "sabzi", toCategory: "daal" });
    expect(opt.validBundles.map((b) => b.fromPicks)).toEqual([1]);
    expect(validateProposedSwap({
      composition,
      applied: [],
      next: { fromCategory: "sabzi", toCategory: "daal", fromPicks: 2 },
    }).ok).toBe(false);
    assertOptionsMatchApply(composition, "sabzi", "daal");
  });
});

describe("Phase 7.1 Case I — Meal Rules still independent of TU", () => {
  it("exclusive_to_plan max=1 rejects two exclusive dishes; valid config ok", () => {
    const NONVEG = 9n;
    const VEG = 8n;
    const rules = [{
      publicId: "mlr_1",
      matchMode: "all" as const,
      action: "max_qualifying" as const,
      actionValue: 1,
      priority: 0,
      conditions: [
        { field: "dish_plan" as const, operator: "is" as const, valueIds: [NONVEG] },
        { field: "category" as const, operator: "is" as const, valueKeys: ["sabzi"] },
      ],
    }];
    const pick = (dishId: bigint, planId: bigint) =>
      ({ dishId, dishName: `d${dishId}`, dishPlanId: planId, category: "sabzi" });
    expect(validateMealRules({
      rules,
      picks: [pick(101n, NONVEG), pick(102n, NONVEG)],
    }).ok).toBe(false);
    expect(validateMealRules({
      rules,
      picks: [pick(101n, NONVEG), pick(201n, VEG)],
    }).ok).toBe(true);
  });
});

describe("Phase 7.1 Case F — Rice↔Roti options≡apply", () => {
  it("never offers 1 roti→rice; multiple bundles when Max TU allows", () => {
    const rice = cat("rice", 1, { unitType: "count", unitLabel: "unit", unitSize: 1 });
    const roti = cat("roti", 0.25, { unitType: "count", unitLabel: "roti", unitSize: 4 });
    const composition = ctx({
      baseCounts: { rice: 1, roti: 8 },
      mealSizeItems: [
        { category: "rice", tuAmount: 1, maxTuAmount: 3, sortOrder: 0 },
        ...Array.from({ length: 8 }, (_, i) => ({ category: "roti", tuAmount: 0.25, maxTuAmount: null, sortOrder: i + 1 })),
      ],
      categories: new Map([["rice", rice], ["roti", roti]]),
    });
    const opt = computeSwapOption({ composition, applied: [], fromCategory: "roti", toCategory: "rice" });
    expect(opt.validBundles.map((b) => b.fromPicks)).toEqual([4, 8]);
    expect(opt.validBundles.some((b) => b.fromPicks === 1)).toBe(false);
    for (const b of opt.validBundles) {
      expect(validateProposedSwap({
        composition,
        applied: [],
        next: { fromCategory: "roti", toCategory: "rice", fromPicks: b.fromPicks },
      })).toMatchObject({ ok: true, qtyTo: b.toPicks });
    }
  });
});
