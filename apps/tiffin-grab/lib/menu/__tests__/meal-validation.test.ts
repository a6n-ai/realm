import { describe, expect, it } from "vitest";
import {
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
    expect(r).toMatchObject({ ok: true, giveTu: 1.5, qtyTo: 3, getTu: 1.5 });
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
    expect(r).toMatchObject({ ok: true, giveTu: 1.0, qtyTo: 2, getTu: 1.0 });
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
    expect(r).toMatchObject({ ok: true, giveTu: 2.5, qtyTo: 5, getTu: 2.5 });
    const opt = computeSwapOption({ composition: peer, applied: [], fromCategory: "sabzi", toCategory: "daal" });
    expect(opt.validBundles.find((b) => b.fromPicks === 2)?.giveNatural).toBe("20oz");
    expect(opt.validBundles.find((b) => b.fromPicks === 2)?.giveNatural).not.toBe("24oz");
  });

  it("Sabzi→Daal at 1.0: 2.5 TU does not divide — no false 2→3 / 24oz bundle", () => {
    const opt = computeSwapOption({ composition: ctx, applied: [], fromCategory: "sabzi", toCategory: "daal" });
    // 1.5/1.0 and 2.5/1.0 are both non-integer — correctly unavailable.
    expect(opt.available).toBe(false);
    expect(opt.validBundles).toEqual([]);
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

describe("validateMealRules — exclusive_to_plan", () => {
  const chicken = 101n;
  const butter = 102n;
  const aloo = 201n;
  const bhindi = 202n;
  const exclusive = new Set([chicken, butter]);

  it("Chicken + Aloo = valid; Chicken + Chicken = invalid when max=1", () => {
    const rules = [{ categoryKey: "sabzi", condition: "exclusive_to_plan" as const, maxCount: 1 }];
    expect(validateMealRules({
      rules, exclusiveDishIds: exclusive,
      picks: [{ category: "sabzi", dishId: chicken }, { category: "sabzi", dishId: aloo }],
    }).ok).toBe(true);
    expect(validateMealRules({
      rules, exclusiveDishIds: exclusive,
      picks: [{ category: "sabzi", dishId: chicken }, { category: "sabzi", dishId: chicken }],
    })).toMatchObject({ ok: false });
  });

  it("three sabzi picks: Chicken + Aloo + Bhindi valid; two exclusive invalid", () => {
    const rules = [{ categoryKey: "sabzi", condition: "exclusive_to_plan" as const, maxCount: 1 }];
    expect(validateMealRules({
      rules, exclusiveDishIds: exclusive,
      picks: [
        { category: "sabzi", dishId: chicken },
        { category: "sabzi", dishId: aloo },
        { category: "sabzi", dishId: bhindi },
      ],
    }).ok).toBe(true);
    const bad = validateMealRules({
      rules, exclusiveDishIds: exclusive,
      picks: [
        { category: "sabzi", dishId: chicken },
        { category: "sabzi", dishId: butter },
        { category: "sabzi", dishId: aloo },
      ],
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toMatch(/only 1 sabzi exclusive/i);
  });

  it("no rules = always ok", () => {
    expect(validateMealRules({
      rules: [],
      exclusiveDishIds: exclusive,
      picks: [{ category: "sabzi", dishId: chicken }, { category: "sabzi", dishId: butter }],
    }).ok).toBe(true);
  });
});
