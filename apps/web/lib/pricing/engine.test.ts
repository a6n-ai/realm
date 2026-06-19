import { describe, expect, it } from "vitest";
import { priceSubscription } from "./engine";
import type { PricingCatalog, PricingSelections } from "./types";

const baseCatalog = (basePrice = 10, freqKey: "5_day" | "mwf" = "5_day", durationPct = 0, weeks = 1): PricingCatalog => ({
  mealSize: { id: "m1", basePrice },
  frequency: freqKey === "5_day"
    ? { key: "5_day", daysPerWeek: 5, courierDiscountPct: 0 }
    : { key: "mwf", daysPerWeek: 3, courierDiscountPct: 10 },
  addons: { saturday: 15, sunday: 15 },
  durationPackage: { weeks, discountPct: durationPct },
});

const sel = (over: Partial<PricingSelections> = {}): PricingSelections => ({
  mealSizeId: "m1",
  frequencyKey: "5_day",
  persons: 1,
  mealSlots: ["lunch"],
  includeSaturday: false,
  includeSunday: false,
  isStudent: false,
  durationWeeks: 1,
  ...over,
});

describe("priceSubscription", () => {
  it("base meal × persons × billable days (5-day)", () => {
    const r = priceSubscription(sel(), baseCatalog(10));
    expect(r.weeklyFee).toBe(50);
    expect(r.total).toBe(50);
  });

  it("daily quantity multiplier", () => {
    const r = priceSubscription(sel({ persons: 3 }), baseCatalog(10));
    expect(r.weeklyFee).toBe(150);
  });

  it("multiplies by meal-slot count", () => {
    const r = priceSubscription(sel({ persons: 2, mealSlots: ["lunch", "dinner"] }), baseCatalog(10));
    // 10 base × 5 days × 2 persons × 2 slots = 200
    expect(r.weeklyFee).toBe(200);
  });

  it("MWF applies 10% courier discount to the meal subtotal only", () => {
    const r = priceSubscription(sel({ frequencyKey: "mwf" }), baseCatalog(10, "mwf"));
    expect(r.discounts).toContainEqual({ label: "Courier discount (MWF)", amount: 3 });
    expect(r.weeklyFee).toBe(27);
  });

  it("weekend add-ons add $15 each and are exempt from courier discount", () => {
    const r = priceSubscription(sel({ frequencyKey: "mwf", includeSaturday: true, includeSunday: true }), baseCatalog(10, "mwf"));
    expect(r.lineItems).toContainEqual({ label: "Saturday Special", amount: 15 });
    expect(r.lineItems).toContainEqual({ label: "Sunday Classics", amount: 15 });
    expect(r.weeklyFee).toBe(57);
  });

  it("student discount is 10% of the running subtotal", () => {
    const r = priceSubscription(sel({ isStudent: true }), baseCatalog(10));
    expect(r.discounts).toContainEqual({ label: "Student discount", amount: 5 });
    expect(r.weeklyFee).toBe(45);
  });

  it("stacks courier → student → duration sequentially", () => {
    const r = priceSubscription(sel({ frequencyKey: "mwf", isStudent: true, durationWeeks: 4 }), baseCatalog(10, "mwf", 5, 4));
    expect(r.weeklyFee).toBe(23.08);
    expect(r.total).toBe(92.32);
  });

  it.each([
    [1, 0, 100, 100],
    [2, 2, 98, 196],
    [4, 5, 95, 380],
    [8, 10, 90, 720],
    [12, 15, 85, 1020],
  ])("duration tier %iwk → %i%% gives weeklyFee %i / total %i", (weeks, pct, weekly, total) => {
    const r = priceSubscription(sel({ durationWeeks: weeks }), baseCatalog(20, "5_day", pct, weeks));
    expect(r.weeklyFee).toBe(weekly);
    expect(r.total).toBe(total);
  });
});
