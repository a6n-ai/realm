import { describe, expect, it } from "vitest";
import { priceSubscription } from "./engine";
import type { PricingCatalog, PricingSelections } from "./types";

const catalog = (basePrice = 10, freqKey: "5_day" | "mwf" = "5_day", courierDiscountPct = 0, extra: Partial<PricingCatalog> = {}): PricingCatalog => ({
  mealSize: { id: "m1", basePrice },
  frequency: freqKey === "5_day" ? { key: "5_day", daysPerWeek: 5 } : { key: "mwf", daysPerWeek: 3 },
  addons: [],
  discounts: courierDiscountPct > 0 ? [{ key: "delivery_x", label: `Delivery schedule discount (${courierDiscountPct}%)`, percent: courierDiscountPct }] : [],
  maxDiscountPct: 25,
  ...extra,
});

const sel = (over: Partial<PricingSelections> = {}): PricingSelections => ({
  mealSizeId: "m1",
  frequencyKey: "5_day",
  persons: 1,
  mealSlots: ["lunch"],
  includeSaturday: false,
  includeSunday: false,
  durationWeeks: 1,
  startDate: "2026-06-23",
  ...over,
});

describe("priceSubscription (per-tiffin)", () => {
  it("counts tiffins as deliveryDays × weeks × persons (slot-agnostic)", () => {
    // 5 days × 4 weeks × 1 person = 20 tiffins at $10 each
    const r = priceSubscription(sel({ durationWeeks: 4 }), catalog(10));
    expect(r.tiffinCount).toBe(20);
    expect(r.perTiffinPrice).toBe(10);
    expect(r.total).toBe(200);
    expect(r.adjustments).toEqual([]);
  });

  it("charges the base price per tiffin whatever the order size", () => {
    const small = priceSubscription(sel(), catalog(10));
    expect(small.tiffinCount).toBe(5);
    expect(small.perTiffinPrice).toBe(10);
    expect(small.total).toBe(50);
    const mid = priceSubscription(sel({ frequencyKey: "mwf", durationWeeks: 4 }), catalog(10, "mwf"));
    expect(mid.tiffinCount).toBe(12);
    expect(mid.perTiffinPrice).toBe(10);
  });

  it("Saturday and Sunday each add a delivery day", () => {
    // (5 + 1 + 1) days × 4 weeks = 28 tiffins → 0% uplift
    const r = priceSubscription(sel({ includeSaturday: true, includeSunday: true, durationWeeks: 4 }), catalog(10));
    expect(r.tiffinCount).toBe(28);
    expect(r.perTiffinPrice).toBe(10);
    expect(r.total).toBe(280);
  });

  it("applies a single catalog discount as an adjustment line", () => {
    // 5 tiffins × $12 = $60 subtotal, 10% cadence discount = $6 off.
    const r = priceSubscription(sel(), catalog(12, "5_day", 10));
    expect(r.subtotal).toBe(60);
    expect(r.adjustments).toEqual([{ label: "Delivery schedule discount (10%)", amount: 6, discountKey: "delivery_x" }]);
    expect(r.total).toBe(54);
  });

  it("adds two discounts up, printing one line each", () => {
    const r = priceSubscription(sel(), catalog(12, "5_day", 0, { discounts: [{ key: "d", label: "Delivery schedule discount (10%)", percent: 10 }, { key: "p", label: "Plan length discount (5%)", percent: 5 }] }));
    expect(r.adjustments.map((a) => [a.discountKey, a.amount])).toEqual([["d", 6], ["p", 3]]);
    expect(r.total).toBe(51);
  });

  it("caps the summed percent and scales lines to sum to the cap", () => {
    const r = priceSubscription(sel(), catalog(12, "5_day", 0, { discounts: [{ key: "d", label: "D", percent: 10 }, { key: "p", label: "P", percent: 20 }] }));
    expect(r.adjustments.reduce((s, a) => s + a.amount, 0)).toBeCloseTo(15, 2);
    expect(r.total).toBe(45);
  });

  it("no discounts leaves totals unchanged", () => {
    expect(priceSubscription(sel(), catalog(12)).total).toBe(60);
  });

  it("prices by eating days, ignoring frequency days, still applying the cadence discount", () => {
    // MWF delivery, eating Mon-Sun: 7/wk × 2 wk = 14 tiffins at $11.
    const r = priceSubscription(sel({ frequencyKey: "mwf", durationWeeks: 2, eatingDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] }), catalog(11, "mwf", 10));
    expect(r.tiffinCount).toBe(14);
    expect(r.adjustments).toEqual([{ label: "Delivery schedule discount (10%)", amount: 15.4, discountKey: "delivery_x" }]);
    expect(r.subtotal).toBe(154);
  });

  it("adds no adjustment when the cadence has no discount", () => {
    const r = priceSubscription(sel(), catalog(10, "5_day", 0));
    expect(r.adjustments).toEqual([]);
  });

  it("is slot-agnostic — extra slots do not change the count", () => {
    const one = priceSubscription(sel({ mealSlots: ["lunch"], durationWeeks: 4 }), catalog(10));
    const three = priceSubscription(sel({ mealSlots: ["breakfast", "lunch", "dinner"], durationWeeks: 4 }), catalog(10));
    expect(three.tiffinCount).toBe(one.tiffinCount);
    expect(three.total).toBe(one.total);
  });

  it("multiplies tiffins by persons", () => {
    // 5 days × 1 week × 4 persons = 20
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
});

describe("priceSubscription (adjustments)", () => {
  it("defaults adjustments to [] — existing callers unaffected", () => {
    const r = priceSubscription(sel({ durationWeeks: 4 }), catalog(10));
    expect(r.adjustments).toEqual([]);
    expect(r.total).toBe(r.subtotal);
  });

  it("subtracts the sum of adjustment magnitudes from total", () => {
    // 20 tiffins → $200 subtotal; two discount lines = $70 off → $130
    const r = priceSubscription(sel({ durationWeeks: 4 }), catalog(10), [
      { label: "Coupon A", amount: 50 },
      { label: "Coupon B", amount: 20 },
    ]);
    expect(r.subtotal).toBe(200);
    expect(r.total).toBe(130);
    expect(r.adjustments).toHaveLength(2);
  });

  it("floors total at 0 when adjustments exceed subtotal", () => {
    const r = priceSubscription(sel({ durationWeeks: 4 }), catalog(10), [{ label: "Huge", amount: 999 }]);
    expect(r.subtotal).toBe(200);
    expect(r.total).toBe(0);
  });
});

describe("priceSubscription (taxes)", () => {
  it("defaults taxes to [] — no tax lines, total unchanged", () => {
    const r = priceSubscription(sel({ durationWeeks: 4 }), catalog(10));
    expect(r.taxLines).toEqual([]);
    expect(r.taxTotal).toBe(0);
    expect(r.total).toBe(r.subtotal);
  });

  it("taxes the post-discount base and adds the total", () => {
    // $200 subtotal − $50 discount = $150 taxable; 5% GST + 7% PST = $7.50 + $10.50 = $18
    const r = priceSubscription(sel({ durationWeeks: 4 }), catalog(10), [{ label: "Coupon", amount: 50 }], [
      { name: "GST", ratePct: 5 },
      { name: "PST", ratePct: 7 },
    ]);
    expect(r.subtotal).toBe(200);
    expect(r.taxLines.map((l) => l.amount)).toEqual([7.5, 10.5]);
    expect(r.taxTotal).toBe(18);
    expect(r.total).toBe(168);
  });

  it("charges no tax when discounts zero out the base", () => {
    const r = priceSubscription(sel({ durationWeeks: 4 }), catalog(10), [{ label: "Huge", amount: 999 }], [
      { name: "GST", ratePct: 5 },
    ]);
    expect(r.taxTotal).toBe(0);
    expect(r.total).toBe(0);
  });
});
