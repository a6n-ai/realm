import { describe, expect, it } from "vitest";
import { compareOptions, durationSavings } from "../recommend";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import type { PricingSelections } from "../types";
import { buildDealTable } from "../deals";

const snapshot = (over: Partial<ClientCatalogSnapshot> = {}): ClientCatalogSnapshot => withDeals({
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

// What the server puts in the catalog payload (load.ts); the client only reads it.
function withDeals(c: ClientCatalogSnapshot): ClientCatalogSnapshot {
  return { ...c, deals: buildDealTable(c as never) };
}

const sel = (over: Partial<PricingSelections> = {}): PricingSelections => ({
  mealSizeId: "msz_1", frequencyKey: "5_day", eatingDays: ["mon", "wed", "fri"], persons: 1, mealSlots: ["lunch"],
  includeSaturday: false, includeSunday: false, durationWeeks: 1, startDate: "2026-06-23", ...over,
});
const d = (key: string, kind: "delivery" | "duration", over = {}) => ({ key, name: key, kind, targetPublicId: null, percent: 10, minWeeks: null, ...over });

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
  it("still shows deals when a delivery strategy or address tag is picked", () => {
    const s = snapshot({
      discounts: [d("dd", "duration", { targetPublicId: "dur_8", percent: 5 })],
      deliveryCharges: { baseCharge: 0, strategyGroups: [], strategyConnections: [], deliveryStrategies: [{ id: "ds_1", name: "x", description: null, chargeType: "fixed", chargeValue: 5, groupId: "g1", connectionId: null, chargeBasis: "once" }], addressTags: [{ id: "tag_1", name: "t", description: null, chargeType: "none", chargeValue: 0 }] },
    });
    const picked = sel({ addressTagId: "tag_1", deliveryStrategyIds: ["ds_1"] });
    expect(durationSavings(s, picked)).toEqual({ 8: 5 });
    expect(compareOptions({ snapshot: s, selections: { ...picked, durationWeeks: 1 }, vary: "duration" }).state).toBe("recommend");
  });
  it("none when nothing differs", () => {
    const flat = snapshot();
    expect(compareOptions({ snapshot: flat, selections: sel(), vary: "frequency" }).state).toBe("none");
  });
});
