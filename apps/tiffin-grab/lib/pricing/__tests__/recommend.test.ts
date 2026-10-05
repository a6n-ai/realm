import { describe, expect, it } from "vitest";
import { compareOptions, durationSavings, recommendDeals } from "../recommend";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import type { PricingSelections } from "../types";

const snapshot = (over: Partial<ClientCatalogSnapshot> = {}): ClientCatalogSnapshot => ({
  plans: [],
  mealSizes: [{ publicId: "msz_1", key: "k", name: "K", description: null, planKey: "veg", tier: "budget", components: [], items: [], kcalMin: 1, kcalMax: 2, proteinG: null, carbsG: null, fatG: null, basePrice: 10, discountType: "none", discountValue: 0, trial: false, custom: false, priceable: true }],
  frequencies: [
    { publicId: "frq_5", key: "5_day", name: "5", daysPerWeek: 5, weekdays: ["mon", "tue", "wed", "thu", "fri"] },
    { publicId: "frq_3", key: "3_day", name: "3", daysPerWeek: 3, weekdays: ["mon", "wed", "fri"] },
  ],
  durations: [{ publicId: "dur_1", weeks: 1 }, { publicId: "dur_8", weeks: 8 }],
  zones: [],
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
  it("tier uplift alone is never advertised as a saving", () => {
    // 1wk x3 = 3 tiffins pays +20%, 8wk x3 = 24 pays 0% — cheaper per tiffin, but no discount exists.
    expect(recommendDeals({ snapshot: snapshot(), selections: sel(), cap: 9 })).toEqual([]);
    expect(durationSavings(snapshot(), sel())).toEqual({});
    expect(compareOptions({ snapshot: snapshot(), selections: sel({ durationWeeks: 8 }), vary: "duration" }).state).toBe("none");
  });

  it("finds a longer duration that carries a plan-length discount", () => {
    const s = snapshot({ discounts: [d("dd", "duration", { targetPublicId: "dur_8", percent: 5 })] });
    expect(durationSavings(s, sel())).toEqual({ 8: 5 });
    const [best] = recommendDeals({ snapshot: s, selections: sel() });
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
    const s = snapshot({ discounts: [d("big", "duration", { targetPublicId: "dur_8", percent: 90 })], maxDiscountPct: 10 });
    const [best] = recommendDeals({ snapshot: s, selections: sel(), cap: 5 });
    // 8wk x3 = 24 tiffins at base 10 (tier 0%): capped 10% => 216
    expect(best.payload.total).toBe(216);
  });

  it("skips frequencies that cannot carry the eating days", () => {
    const s = snapshot({ frequencies: [{ publicId: "frq_5", key: "5_day", name: "5", daysPerWeek: 5, weekdays: ["mon", "tue", "wed", "thu", "fri"] }, { publicId: "frq_t", key: "tue", name: "t", daysPerWeek: 1, weekdays: ["thu"] }] as never });
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
    const withDur = snapshot({ discounts: [d("dl", "delivery", { targetPublicId: "frq_3", percent: 10 }), d("dd", "duration", { targetPublicId: "dur_8", percent: 5 })] });
    const deals = recommendDeals({ snapshot: withDur, selections: sel(), vary: "duration", cap: 9 });
    expect(deals.length).toBeGreaterThan(0);
    expect(deals.every((x) => x.payload.frequencyKey === "5_day")).toBe(true);
  });
});

describe("compareOptions", () => {
  const disc = snapshot({ discounts: [d("dl", "delivery", { targetPublicId: "frq_3", percent: 10 })] });
  it("recommend when a cheaper option exists", () => {
    const c = compareOptions({ snapshot: disc, selections: sel({ durationWeeks: 8 }), vary: "frequency" });
    expect(c.state).toBe("recommend");
  });
  it("applied when the current option is best and beats the least-discounted", () => {
    const c = compareOptions({ snapshot: disc, selections: sel({ durationWeeks: 8, frequencyKey: "3_day" }), vary: "frequency" });
    expect(c.state).toBe("applied");
    if (c.state === "applied") {
      expect(c.deal.savingPct).toBeGreaterThanOrEqual(1);
      expect(c.least.frequencyKey).toBe("5_day");
    }
  });
  it("applied for duration", () => {
    const s = snapshot({ discounts: [d("dd", "duration", { targetPublicId: "dur_8", percent: 5 })] });
    expect(compareOptions({ snapshot: s, selections: sel({ durationWeeks: 8 }), vary: "duration" }).state).toBe("applied");
  });
  it("recommend quotes the saving the pills show, not the gap from the current pick", () => {
    const s = snapshot({
      durations: [{ publicId: "dur_1", weeks: 1 }, { publicId: "dur_4", weeks: 4 }, { publicId: "dur_12", weeks: 12 }] as never,
      discounts: [d("d4", "duration", { targetPublicId: "dur_4", percent: 5 }), d("d12", "duration", { targetPublicId: "dur_12", percent: 10 })],
    });
    const c = compareOptions({ snapshot: s, selections: sel({ durationWeeks: 4 }), vary: "duration" });
    expect(c.state).toBe("recommend");
    if (c.state === "recommend") {
      expect(c.deal.payload.durationWeeks).toBe(12);
      expect(Math.round(c.deal.savingPct)).toBe(durationSavings(s, sel())[12]);
    }
  });
  it("none when nothing differs", () => {
    const flat = snapshot();
    expect(compareOptions({ snapshot: flat, selections: sel(), vary: "frequency" }).state).toBe("none");
  });
});
