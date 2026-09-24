import { describe, expect, it } from "vitest";
import {
  computeAllSwapOptions,
  computeSwapOption,
  maxTuForCategory,
  resultingCategoryTu,
  validateMealRules,
  validateProposedSwap,
  type CompositionContext,
} from "../meal-validation";
import type { SwapCategory } from "../swap-rules";
import { tuToNatural } from "../format-tu";

const cat = (key: string, pickTu: number | null, over: Partial<SwapCategory> = {}): SwapCategory => ({
  key,
  pickTu,
  unitType: "count",
  unitLabel: key === "roti" ? "roti" : "unit",
  maxPicksPerTiffin: null,
  unitSize: key === "roti" ? 4 : 1,
  ...over,
});

function composition(over: Partial<CompositionContext> & Pick<CompositionContext, "baseCounts" | "mealSizeItems" | "categories">): CompositionContext {
  return { labels: { rice: "Rice", roti: "Roti", sabzi: "Sabzi" }, ...over };
}

describe("TU natural units (config-driven)", () => {
  it("1 TU Roti = 4 roti; 1.5 TU Roti = 6 roti", () => {
    const roti = { tuUnitType: "count" as const, tuUnitSize: 4, tuUnitLabel: "roti" };
    expect(tuToNatural(roti, 1)).toBe(4);
    expect(tuToNatural(roti, 1.5)).toBe(6);
  });
});

describe("validateProposedSwap / computeSwapOption — Roti ↔ Rice", () => {
  const rice = cat("rice", 1);
  const roti = cat("roti", 0.25);
  const ctx = composition({
    baseCounts: { rice: 1, roti: 8 },
    mealSizeItems: [
      { category: "rice", tuAmount: 1, maxTuAmount: 2, sortOrder: 0 },
      ...Array.from({ length: 8 }, (_, i) => ({ category: "roti", tuAmount: 0.25, maxTuAmount: null, sortOrder: i + 1 })),
    ],
    categories: new Map([["rice", rice], ["roti", roti]]),
  });

  it("4 roti → 1 rice is valid; 8 roti → 2 rice exceeds Max TU=2; 12 roti blocked", () => {
    expect(validateProposedSwap({ composition: ctx, applied: [], next: { fromCategory: "roti", toCategory: "rice", fromPicks: 4 } })).toMatchObject({ ok: true, qtyTo: 1 });
    const eight = validateProposedSwap({ composition: ctx, applied: [], next: { fromCategory: "roti", toCategory: "rice", fromPicks: 8 } });
    expect(eight.ok).toBe(false);
    if (!eight.ok) expect(eight.reason).toMatch(/maximum Rice/i);

    const rich = composition({
      ...ctx,
      baseCounts: { rice: 1, roti: 12 },
      mealSizeItems: [
        { category: "rice", tuAmount: 1, maxTuAmount: 2, sortOrder: 0 },
        ...Array.from({ length: 12 }, (_, i) => ({ category: "roti", tuAmount: 0.25, maxTuAmount: null, sortOrder: i + 1 })),
      ],
    });
    const over = validateProposedSwap({ composition: rich, applied: [], next: { fromCategory: "roti", toCategory: "rice", fromPicks: 12 } });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.reason).toMatch(/maximum Rice/i);
  });

  it("valid options never offer 1 roti → rice; Max TU caps at one rice add", () => {
    const opt = computeSwapOption({ composition: ctx, applied: [], fromCategory: "roti", toCategory: "rice" });
    expect(opt.available).toBe(true);
    expect(opt.validBundles.map((b) => b.fromPicks)).toEqual([4]);
    expect(opt.minFromPicks).toBe(4);
    expect(opt.maxFromPicks).toBe(4);
    expect(opt.bundleIncrement).toBe(4);
    expect(opt.giveNatural).toBe("4 roti");
    expect(opt.getNatural).toBe("1 unit");
  });

  it("with Max TU=3, both 4→1 and 8→2 rice bundles are offered", () => {
    const roomy = composition({
      ...ctx,
      mealSizeItems: [
        { category: "rice", tuAmount: 1, maxTuAmount: 3, sortOrder: 0 },
        ...Array.from({ length: 8 }, (_, i) => ({ category: "roti", tuAmount: 0.25, maxTuAmount: null, sortOrder: i + 1 })),
      ],
    });
    expect(validateProposedSwap({ composition: roomy, applied: [], next: { fromCategory: "roti", toCategory: "rice", fromPicks: 8 } })).toMatchObject({ ok: true, qtyTo: 2 });
    const opt = computeSwapOption({ composition: roomy, applied: [], fromCategory: "roti", toCategory: "rice" });
    expect(opt.validBundles.map((b) => b.fromPicks)).toEqual([4, 8]);
  });
});

describe("Rice → Roti uneven pickTu (representative first-row)", () => {
  // When roti pickTu is 1.5 (first of heterogeneous meal) and rice is 1,
  // 1 rice does not divide into roti picks — options must start at 3 rice → 2 roti.
  it("does not offer 1 rice when only 3 rice → 2 roti divides", () => {
    const rice = cat("rice", 1);
    const roti = cat("roti", 1.5, { unitSize: 4 });
    const ctx = composition({
      baseCounts: { rice: 3, roti: 2 },
      mealSizeItems: [
        { category: "roti", tuAmount: 1.5, maxTuAmount: null, sortOrder: 0 },
        { category: "roti", tuAmount: 1.5, maxTuAmount: null, sortOrder: 1 },
        { category: "rice", tuAmount: 1, maxTuAmount: null, sortOrder: 2 },
        { category: "rice", tuAmount: 1, maxTuAmount: null, sortOrder: 3 },
        { category: "rice", tuAmount: 1, maxTuAmount: null, sortOrder: 4 },
      ],
      categories: new Map([["rice", rice], ["roti", roti]]),
    });
    const opt = computeSwapOption({ composition: ctx, applied: [], fromCategory: "rice", toCategory: "roti" });
    expect(opt.available).toBe(true);
    expect(opt.validBundles.map((b) => [b.fromPicks, b.toPicks])).toEqual([[3, 2]]);
    expect(opt.validBundles.some((b) => b.fromPicks === 1)).toBe(false);
  });
});

describe("multi-row Sabzi composition (actual row TU — Phase 7)", () => {
  const sabzi = cat("sabzi", 1.5, { unitType: "weight", unitLabel: "oz", unitSize: 8 });
  const daal = cat("daal", 1.0, { unitType: "weight", unitLabel: "oz", unitSize: 8 });
  const items = [
    { category: "sabzi", tuAmount: 1.5, maxTuAmount: null, sortOrder: 0 },
    { category: "sabzi", tuAmount: 1.0, maxTuAmount: null, sortOrder: 1 },
    { category: "daal", tuAmount: 1.0, maxTuAmount: null, sortOrder: 2 },
  ];
  const ctx = composition({
    baseCounts: { sabzi: 2, daal: 1 },
    mealSizeItems: items,
    categories: new Map([["sabzi", sabzi], ["daal", daal]]),
    labels: { sabzi: "Sabzi", daal: "Daal" },
  });

  it("total is 2.5 TU / 20oz — never 2×1.5 = 3 TU / 24oz", () => {
    expect(resultingCategoryTu(ctx, "sabzi", { sabzi: 2 })).toBe(2.5);
    expect(tuToNatural({ tuUnitType: "weight", tuUnitSize: 8, tuUnitLabel: "oz" }, 2.5)).toBe(20);
    expect(resultingCategoryTu(ctx, "sabzi", { sabzi: 3 })).toBe(4.0); // +1 inbound at first-row rate
    expect(maxTuForCategory(items, "sabzi")).toBeNull();
  });

  it("Case A — give first row accounts for 1.5 TU", () => {
    const r = validateProposedSwap({
      composition: {
        ...ctx,
        // Peer that divides 1.5 evenly (0.5 TU daal picks).
        mealSizeItems: [
          ...items.slice(0, 2),
          { category: "daal", tuAmount: 0.5, maxTuAmount: null, sortOrder: 2 },
        ],
        categories: new Map([
          ["sabzi", sabzi],
          ["daal", cat("daal", 0.5, { unitType: "weight", unitLabel: "oz", unitSize: 8 })],
        ]),
      },
      applied: [],
      next: { fromCategory: "sabzi", toCategory: "daal", fromPicks: 1 },
    });
    expect(r).toMatchObject({ ok: true, giveTu: 1.5, qtyTo: 1, getTu: 1.5 }); // same unit: one 12oz daal
  });

  it("Case B — after first row gone, giving the remaining row accounts for 1.0 TU", () => {
    const peer = composition({
      baseCounts: { sabzi: 2, daal: 1 },
      mealSizeItems: [
        { category: "sabzi", tuAmount: 1.5, maxTuAmount: null, sortOrder: 0 },
        { category: "sabzi", tuAmount: 1.0, maxTuAmount: null, sortOrder: 1 },
        { category: "daal", tuAmount: 0.5, maxTuAmount: null, sortOrder: 2 },
      ],
      categories: new Map([
        ["sabzi", sabzi],
        ["daal", cat("daal", 0.5, { unitType: "weight", unitLabel: "oz", unitSize: 8 })],
      ]),
      labels: { sabzi: "Sabzi", daal: "Daal" },
    });
    const afterFirst: { fromCategory: string; toCategory: string; qtyFrom: number; qtyTo: number }[] = [
      { fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: 3 },
    ];
    expect(resultingCategoryTu(peer, "sabzi", { sabzi: 1 }, afterFirst)).toBe(1.0);
    const r = validateProposedSwap({
      composition: peer,
      applied: afterFirst,
      next: { fromCategory: "sabzi", toCategory: "daal", fromPicks: 1 },
    });
    expect(r).toMatchObject({ ok: true, giveTu: 1.0, qtyTo: 1, getTu: 1.0 });
  });

  it("Case C — give both rows = 2.5 TU, not 3.0 TU", () => {
    const peer = composition({
      baseCounts: { sabzi: 2, daal: 1 },
      mealSizeItems: [
        { category: "sabzi", tuAmount: 1.5, maxTuAmount: null, sortOrder: 0 },
        { category: "sabzi", tuAmount: 1.0, maxTuAmount: null, sortOrder: 1 },
        { category: "daal", tuAmount: 0.5, maxTuAmount: null, sortOrder: 2 },
      ],
      categories: new Map([
        ["sabzi", sabzi],
        ["daal", cat("daal", 0.5, { unitType: "weight", unitLabel: "oz", unitSize: 8 })],
      ]),
      labels: { sabzi: "Sabzi", daal: "Daal" },
    });
    const r = validateProposedSwap({
      composition: peer,
      applied: [],
      next: { fromCategory: "sabzi", toCategory: "daal", fromPicks: 2 },
    });
    expect(r).toMatchObject({ ok: true, giveTu: 2.5, qtyTo: 2, getTu: 2.5 });
    const opt = computeSwapOption({ composition: peer, applied: [], fromCategory: "sabzi", toCategory: "daal" });
    expect(opt.validBundles.find((b) => b.fromPicks === 2)?.giveNatural).toBe("12oz + 8oz");
    expect(opt.validBundles.find((b) => b.fromPicks === 2)?.giveNatural).not.toBe("24oz");
  });

  it("Sabzi→Daal at 1.0: like-for-like keeps 12oz and 12oz + 8oz — no false 2→3 / 24oz bundle", () => {
    const opt = computeSwapOption({ composition: ctx, applied: [], fromCategory: "sabzi", toCategory: "daal" });
    expect(opt.validBundles.map((b) => [b.fromPicks, b.toPicks, b.getNatural])).toEqual([[1, 1, "12oz"], [2, 2, "12oz + 8oz"]]);
  });

  it("single-row Sabzi 1.5 behaves like before (compatibility)", () => {
    const single = composition({
      baseCounts: { sabzi: 1, daal: 1 },
      mealSizeItems: [
        { category: "sabzi", tuAmount: 1.5, maxTuAmount: null, sortOrder: 0 },
        { category: "daal", tuAmount: 1.5, maxTuAmount: null, sortOrder: 1 },
      ],
      categories: new Map([
        ["sabzi", sabzi],
        ["daal", cat("daal", 1.5, { unitType: "weight", unitLabel: "oz", unitSize: 8 })],
      ]),
      labels: { sabzi: "Sabzi", daal: "Daal" },
    });
    const r = validateProposedSwap({
      composition: single,
      applied: [],
      next: { fromCategory: "sabzi", toCategory: "daal", fromPicks: 1 },
    });
    expect(r).toMatchObject({ ok: true, qtyTo: 1, giveTu: 1.5, getTu: 1.5 });
    const opt = computeSwapOption({ composition: single, applied: [], fromCategory: "sabzi", toCategory: "daal" });
    expect(opt.giveNatural).toBe("12oz");
    expect(opt.getNatural).toBe("12oz");
  });
});

// The legacy `exclusive_to_plan` rule is now expressed as
// `dish_plan is <plan> AND category is <key>` with a max_qualifying action —
// the same behaviour the migration backfills existing rows into. These cases
// are kept verbatim in meaning so that equivalence is provable.
describe("validateMealRules — plan-exclusive limit (migrated shape)", () => {
  const NONVEG = 9n;
  const VEG = 8n;
  const chicken = { dishId: 101n, dishName: "Chicken Curry", dishPlanId: NONVEG, category: "sabzi" };
  const butter = { dishId: 102n, dishName: "Butter Chicken", dishPlanId: NONVEG, category: "sabzi" };
  const aloo = { dishId: 201n, dishName: "Aloo Gobi", dishPlanId: VEG, category: "sabzi" };
  const bhindi = { dishId: 202n, dishName: "Bhindi Masala", dishPlanId: VEG, category: "sabzi" };

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

  it("Chicken + Aloo = valid; Chicken + Chicken = invalid when max=1", () => {
    expect(validateMealRules({ rules, picks: [chicken, aloo] }).ok).toBe(true);
    expect(validateMealRules({ rules, picks: [chicken, chicken] })).toMatchObject({ ok: false });
  });

  it("three sabzi picks: one non-veg valid; two non-veg invalid", () => {
    expect(validateMealRules({ rules, picks: [chicken, aloo, bhindi] }).ok).toBe(true);
    const bad = validateMealRules({ rules, picks: [chicken, butter, aloo] });
    expect(bad.ok).toBe(false);
    // The message is the rule's own sentence, and it names which rule failed so
    // the picker can highlight it.
    if (!bad.ok) {
      expect(bad.rulePublicId).toBe("mlr_1");
      expect(bad.reason).toMatch(/at most 1/i);
    }
  });

  it("does not constrain a category the rule does not name", () => {
    const rice = { dishId: 301n, dishName: "Jeera Rice", dishPlanId: NONVEG, category: "rice" };
    expect(validateMealRules({ rules, picks: [chicken, rice] }).ok).toBe(true);
  });

  it("no rules = always ok", () => {
    expect(validateMealRules({ rules: [], picks: [chicken, butter] }).ok).toBe(true);
  });
});

describe("Swap engine: Opposing swaps & single-item bundle suppression (Fix 1 & Fix 2)", () => {
  const rice = cat("rice", 1);
  const roti = cat("roti", 0.25);
  const sabzi = cat("sabzi", 1.0, { unitType: "weight", unitLabel: "oz", unitSize: 8 });
  const daal = cat("daal", 1.0, { unitType: "weight", unitLabel: "oz", unitSize: 8 });

  const ctx = composition({
    baseCounts: { rice: 1, roti: 8, sabzi: 2, daal: 1 },
    mealSizeItems: [
      { category: "rice", tuAmount: 1, maxTuAmount: 2, sortOrder: 0 },
      ...Array.from({ length: 8 }, (_, i) => ({ category: "roti", tuAmount: 0.25, maxTuAmount: null, sortOrder: i + 1 })),
      { category: "sabzi", tuAmount: 1, maxTuAmount: null, sortOrder: 10 },
      { category: "sabzi", tuAmount: 1, maxTuAmount: null, sortOrder: 11 },
      { category: "daal", tuAmount: 1, maxTuAmount: null, sortOrder: 12 },
    ],
    categories: new Map([["rice", rice], ["roti", roti], ["sabzi", sabzi], ["daal", daal]]),
    labels: { rice: "Rice", roti: "Roti", sabzi: "Sabzi", daal: "Daal" },
  });

  // 1. Roti → Rice: 4 Roti → 1 Rice remains available.
  it("1. Roti → Rice: 4 Roti → 1 Rice remains available", () => {
    const opt = computeSwapOption({ composition: ctx, applied: [], fromCategory: "roti", toCategory: "rice" });
    expect(opt.available).toBe(true);
    expect(opt.validBundles).toContainEqual(
      expect.objectContaining({ fromPicks: 4, toPicks: 1, giveNatural: "4 roti", getNatural: "1 unit" }),
    );
  });

  // 2. Rice → Roti: 1 Rice → 4 Roti remains available.
  it("2. Rice → Roti: 1 Rice → 4 Roti remains available", () => {
    const opt = computeSwapOption({ composition: ctx, applied: [], fromCategory: "rice", toCategory: "roti" });
    expect(opt.available).toBe(true);
    expect(opt.validBundles).toContainEqual(
      expect.objectContaining({ fromPicks: 1, toPicks: 4, giveNatural: "1 unit", getNatural: "4 roti" }),
    );
  });

  // 3. After Roti → Rice is applied: Rice → Roti is NOT offered as an opposing swap.
  it("3. After Roti → Rice is applied: Rice → Roti is NOT offered as an opposing swap", () => {
    const applied = [{ fromCategory: "roti", toCategory: "rice", qtyFrom: 4, qtyTo: 1 }];
    const opt = computeSwapOption({ composition: ctx, applied, fromCategory: "rice", toCategory: "roti" });
    expect(opt.available).toBe(false);
    expect(opt.validBundles).toEqual([]);
    expect(opt.reason).toMatch(/already applied/i);

    const check = validateProposedSwap({
      composition: ctx,
      applied,
      next: { fromCategory: "rice", toCategory: "roti", fromPicks: 1 },
    });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toMatch(/already applied/i);

    // computeAllSwapOptions hides it when hideUnavailable: true
    const all = computeAllSwapOptions({
      composition: ctx,
      applied,
      pairs: [{ fromCategory: "rice", toCategory: "roti" }, { fromCategory: "roti", toCategory: "rice" }],
      hideUnavailable: true,
    });
    expect(all.some((o) => o.fromCategory === "rice" && o.toCategory === "roti")).toBe(false);
  });

  // 4. After Roti → Rice is applied / with multiple rice available: 1 Rice → 4 Roti is not duplicated by 2 Rice → 8 Roti.
  it("4. When Rice has multiple units available: 1 Rice → 4 Roti is not duplicated by 2 Rice → 8 Roti", () => {
    const multiRiceCtx = composition({
      ...ctx,
      baseCounts: { ...ctx.baseCounts, rice: 2, roti: 4 },
      mealSizeItems: [
        { category: "rice", tuAmount: 1, maxTuAmount: 3, sortOrder: 0 },
        { category: "rice", tuAmount: 1, maxTuAmount: 3, sortOrder: 1 },
        ...Array.from({ length: 4 }, (_, i) => ({ category: "roti", tuAmount: 0.25, maxTuAmount: null, sortOrder: i + 2 })),
      ],
    });
    const opt = computeSwapOption({ composition: multiRiceCtx, applied: [], fromCategory: "rice", toCategory: "roti" });
    expect(opt.available).toBe(true);
    expect(opt.validBundles.map((b) => b.fromPicks)).toEqual([1]);
    expect(opt.validBundles[0]?.toPicks).toBe(4);
    expect(opt.validBundles.some((b) => b.fromPicks === 2)).toBe(false);
  });

  // 5. Generic opposing swap: If A → B exists, B → A is unavailable.
  it("5. Generic opposing swap: If Sabzi → Daal exists, Daal → Sabzi is unavailable", () => {
    const applied = [{ fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: 1 }];
    const opt = computeSwapOption({ composition: ctx, applied, fromCategory: "daal", toCategory: "sabzi" });
    expect(opt.available).toBe(false);
    expect(opt.reason).toMatch(/already applied/i);

    const check = validateProposedSwap({
      composition: ctx,
      applied,
      next: { fromCategory: "daal", toCategory: "sabzi", fromPicks: 1 },
    });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toMatch(/already applied/i);
  });

  // 6. Multi-item exchange: A category requiring multiple source items to reach target TU still generates required bundle.
  it("6. Multi-item exchange: Roti → Rice requiring 4 source items still generates the required bundle", () => {
    const opt = computeSwapOption({ composition: ctx, applied: [], fromCategory: "roti", toCategory: "rice" });
    expect(opt.available).toBe(true);
    expect(opt.validBundles.map((b) => b.fromPicks)).toEqual([4]);
    expect(opt.validBundles[0]?.toPicks).toBe(1);
    expect(opt.minFromPicks).toBe(4);
    expect(opt.bundleIncrement).toBe(4);
  });

  // 7. Existing TU/multi-row swap tests remain green (verified by the full suite, and explicit test here).
  it("7. Existing TU/multi-row swap with heterogeneous rows generates multi-row bundles", () => {
    const peer = composition({
      baseCounts: { sabzi: 2, daal: 1 },
      mealSizeItems: [
        { category: "sabzi", tuAmount: 1.5, maxTuAmount: null, sortOrder: 0 },
        { category: "sabzi", tuAmount: 1.0, maxTuAmount: null, sortOrder: 1 },
        { category: "daal", tuAmount: 0.5, maxTuAmount: null, sortOrder: 2 },
      ],
      categories: new Map([
        ["sabzi", cat("sabzi", 1.5, { unitType: "weight", unitLabel: "oz", unitSize: 8 })],
        ["daal", cat("daal", 0.5, { unitType: "weight", unitLabel: "oz", unitSize: 8 })],
      ]),
      labels: { sabzi: "Sabzi", daal: "Daal" },
    });
    const opt = computeSwapOption({ composition: peer, applied: [], fromCategory: "sabzi", toCategory: "daal" });
    expect(opt.available).toBe(true);
    // 1 pick = 1.5 TU (12oz) → 3 daal; 2 picks = 2.5 TU (20oz) → 5 daal
    expect(opt.validBundles.find((b) => b.fromPicks === 1)?.giveNatural).toBe("12oz");
    expect(opt.validBundles.find((b) => b.fromPicks === 2)?.giveNatural).toBe("12oz + 8oz");
  });

  // 8. Existing Undo behavior still works: Undoing A → B restores original state.
  it("8. Existing Undo behavior: removing applied A → B restores availability of B → A", () => {
    let applied = [{ fromCategory: "roti", toCategory: "rice", qtyFrom: 4, qtyTo: 1 }];
    expect(computeSwapOption({ composition: ctx, applied, fromCategory: "rice", toCategory: "roti" }).available).toBe(false);

    // Simulate undo (removing the applied swap row)
    applied = [];
    const restored = computeSwapOption({ composition: ctx, applied, fromCategory: "rice", toCategory: "roti" });
    expect(restored.available).toBe(true);
    expect(restored.validBundles).toContainEqual(
      expect.objectContaining({ fromPicks: 1, toPicks: 4 }),
    );
  });
});

