import { describe, expect, it } from "vitest";
import { priceSubscription } from "./engine";
import type { PricingCatalog, PricingSelections } from "./types";
import type { PricingTier } from "./tiers";

const TIERS: PricingTier[] = [
  { minQty: 1, maxQty: 11, upliftPct: 20 },
  { minQty: 12, maxQty: 19, upliftPct: 10 },
  { minQty: 20, maxQty: null, upliftPct: 0 },
];

const catalog = (basePrice = 10, freqKey: "5_day" | "mwf" = "5_day"): PricingCatalog => ({
  mealSize: { id: "m1", basePrice },
  frequency: freqKey === "5_day" ? { key: "5_day", daysPerWeek: 5 } : { key: "mwf", daysPerWeek: 3 },
  tiers: TIERS,
});

const sel = (over: Partial<PricingSelections> = {}): PricingSelections => ({
  mealSizeId: "m1",
  frequencyKey: "5_day",
  persons: 1,
  mealSlots: ["lunch"],
  includeSaturday: false,
  includeSunday: false,
  durationWeeks: 1,
  ...over,
});

describe("priceSubscription (per-tiffin)", () => {
  it("counts tiffins as deliveryDays × weeks × persons (slot-agnostic)", () => {
    // 5 days × 4 weeks × 1 person = 20 tiffins → 0% uplift → $10 each
    const r = priceSubscription(sel({ durationWeeks: 4 }), catalog(10));
    expect(r.tiffinCount).toBe(20);
    expect(r.perTiffinPrice).toBe(10);
    expect(r.total).toBe(200);
    expect(r.tier.upliftPct).toBe(0);
    expect(r.adjustments).toEqual([]);
  });

  it("applies the small-volume uplift below 12", () => {
    // 5 days × 1 week = 5 tiffins → 20% uplift → $12 each
    const r = priceSubscription(sel(), catalog(10));
    expect(r.tiffinCount).toBe(5);
    expect(r.perTiffinPrice).toBe(12);
    expect(r.total).toBe(60);
  });

  it("applies the mid-band uplift at 12–19", () => {
    // 3 days × 4 weeks = 12 tiffins → 10% uplift → $11 each
    const r = priceSubscription(sel({ frequencyKey: "mwf", durationWeeks: 4 }), catalog(10, "mwf"));
    expect(r.tiffinCount).toBe(12);
    expect(r.perTiffinPrice).toBe(11);
    expect(r.total).toBe(132);
  });

  it("Saturday and Sunday each add a delivery day", () => {
    // (5 + 1 + 1) days × 4 weeks = 28 tiffins → 0% uplift
    const r = priceSubscription(sel({ includeSaturday: true, includeSunday: true, durationWeeks: 4 }), catalog(10));
    expect(r.tiffinCount).toBe(28);
    expect(r.perTiffinPrice).toBe(10);
    expect(r.total).toBe(280);
  });

  it("is slot-agnostic — extra slots do not change the count", () => {
    const one = priceSubscription(sel({ mealSlots: ["lunch"], durationWeeks: 4 }), catalog(10));
    const three = priceSubscription(sel({ mealSlots: ["breakfast", "lunch", "dinner"], durationWeeks: 4 }), catalog(10));
    expect(three.tiffinCount).toBe(one.tiffinCount);
    expect(three.total).toBe(one.total);
  });

  it("multiplies tiffins by persons", () => {
    // 5 days × 1 week × 4 persons = 20 → 0% uplift
    const r = priceSubscription(sel({ persons: 4 }), catalog(10));
    expect(r.tiffinCount).toBe(20);
    expect(r.total).toBe(200);
  });

  it("returns a single tiffins line item and an empty adjustments array", () => {
    const r = priceSubscription(sel(), catalog(10));
    expect(r.lineItems).toHaveLength(1);
    expect(r.lineItems[0].amount).toBe(r.subtotal);
    expect(r.subtotal).toBe(r.total);
  });

  it("throws when tiers are misconfigured (no match)", () => {
    expect(() => priceSubscription(sel(), { ...catalog(10), tiers: [{ minQty: 100, maxQty: null, upliftPct: 0 }] })).toThrow();
  });
});
