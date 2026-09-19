import { describe, expect, it } from "vitest";
import { rankDeals, recommendDeals } from "../recommend";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import type { PricingSelections } from "../types";

const snapshot = (over: Partial<ClientCatalogSnapshot> = {}): ClientCatalogSnapshot => ({
  plans: [],
  mealSizes: [{ publicId: "msz_1", key: "k", name: "K", description: null, planKey: "veg", tier: "budget", components: [], items: [], kcalMin: 1, kcalMax: 2, proteinG: null, carbsG: null, fatG: null, basePrice: 10, discountType: "none", discountValue: 0, trial: false }],
  frequencies: [
    { publicId: "frq_5", key: "5_day", name: "5", daysPerWeek: 5, courierDiscountPct: 0, weekdays: ["mon", "tue", "wed", "thu", "fri"] },
    { publicId: "frq_3", key: "3_day", name: "3", daysPerWeek: 3, courierDiscountPct: 0, weekdays: ["mon", "wed", "fri"] },
  ],
  durations: [{ publicId: "dur_1", weeks: 1, discountPct: 0 }, { publicId: "dur_8", weeks: 8, discountPct: 0 }],
  zones: [],
  tiers: [{ minQty: 1, maxQty: 11, upliftPct: 20 }, { minQty: 12, maxQty: 19, upliftPct: 10 }, { minQty: 20, maxQty: null, upliftPct: 0 }],
  discounts: [],
  maxDiscountPct: 25,
  ...over,
} as unknown as ClientCatalogSnapshot);

const sel = (over: Partial<PricingSelections> = {}): PricingSelections => ({
  mealSizeId: "msz_1", frequencyKey: "5_day", eatingDays: ["mon", "wed", "fri"], persons: 1, mealSlots: ["lunch"],
  includeSaturday: false, includeSunday: false, durationWeeks: 1, startDate: "2026-06-23", ...over,
});
const d = (key: string, kind: "delivery" | "duration", over = {}) => ({ key, name: key, kind, targetPublicId: null, percent: 10, minWeeks: null, ...over });

describe("recommendDeals", () => {
  it("finds a cheaper per-tiffin price via a longer duration", () => {
    const [best] = recommendDeals({ snapshot: snapshot(), selections: sel() });
    expect(best.payload.durationWeeks).toBe(8);
    expect(best.savingPct).toBeGreaterThan(1);
    expect(best.totalDelta).toBeGreaterThan(0);
  });

  it("finds a cheaper frequency", () => {
    const s = snapshot({ discounts: [d("dl", "delivery", { targetPublicId: "frq_3", percent: 10 })] });
    const deals = recommendDeals({ snapshot: s, selections: sel({ durationWeeks: 8 }), cap: 5 });
    expect(deals[0].payload).toMatchObject({ frequencyKey: "3_day", durationWeeks: 8 });
  });

  it("drops non-improving alternatives (already best)", () => {
    expect(recommendDeals({ snapshot: snapshot(), selections: sel({ durationWeeks: 8 }) })).toEqual([]);
  });

  it("respects the discount cap when pricing alternatives", () => {
    const s = snapshot({ discounts: [d("big", "duration", { percent: 90 })], maxDiscountPct: 10 });
    const [best] = recommendDeals({ snapshot: s, selections: sel(), cap: 5 });
    // 8wk x3 = 24 tiffins at base 10 (tier 0%): capped 10% => 216
    expect(best.payload.total).toBe(216);
  });

  it("skips frequencies that cannot carry the eating days", () => {
    const s = snapshot({ frequencies: [{ publicId: "frq_5", key: "5_day", name: "5", daysPerWeek: 5, courierDiscountPct: 0, weekdays: ["mon", "tue", "wed", "thu", "fri"] }, { publicId: "frq_t", key: "tue", name: "t", daysPerWeek: 1, courierDiscountPct: 0, weekdays: ["thu"] }] as never });
    const deals = recommendDeals({ snapshot: s, selections: sel({ durationWeeks: 1 }), cap: 9 });
    expect(deals.every((x) => x.payload.frequencyKey !== "tue")).toBe(true);
  });
});

describe("recommendDeals vary", () => {
  const s = snapshot({ discounts: [d("dl", "delivery", { targetPublicId: "frq_3", percent: 10 })] });
  it("frequency never changes weeks", () => {
    const deals = recommendDeals({ snapshot: s, selections: sel({ durationWeeks: 8 }), vary: "frequency", cap: 9 });
    expect(deals.length).toBeGreaterThan(0);
    expect(deals.every((x) => x.payload.durationWeeks === 8)).toBe(true);
    expect(deals[0].payload.includes).toEqual([{ name: "dl", percent: 10 }]);
  });
  it("duration never changes frequency", () => {
    const deals = recommendDeals({ snapshot: s, selections: sel(), vary: "duration", cap: 9 });
    expect(deals.length).toBeGreaterThan(0);
    expect(deals.every((x) => x.payload.frequencyKey === "5_day")).toBe(true);
  });
});

describe("rankDeals", () => {
  const alt = (id: string, total: number, units: number) => ({ id, label: id, total, units, payload: null });
  it("ranks by per-unit and applies minSavingPct / empty current", () => {
    const r = rankDeals({ total: 100, units: 10 }, [alt("a", 180, 20), alt("b", 99, 10), alt("c", 120, 10)]);
    expect(r.map((x) => x.id)).toEqual(["a"]);
    expect(r[0]).toMatchObject({ perUnit: 9, savingPerUnit: 1, totalDelta: 80 });
    expect(rankDeals({ total: 0, units: 0 }, [alt("a", 1, 1)])).toEqual([]);
  });
});
