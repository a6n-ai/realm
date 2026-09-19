import { ValidationError } from "@foundry/commons";
import { describe, expect, it } from "vitest";
import { buildPricingCatalog } from "./build-catalog";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import type { PricingSelections } from "./types";

const snapshot: CatalogSnapshot = {
  plans: [],
  mealSizes: [
    { id: BigInt(1), publicId: "msz_1", key: "k", name: "K", description: null, planId: BigInt(1), planKey: "veg", tier: "budget", components: [], items: [], kcalMin: 1, kcalMax: 2, proteinG: null, carbsG: null, fatG: null, basePrice: 10, discountType: "none", discountValue: 0, trial: false },
  ],
  frequencies: [{ id: BigInt(2), publicId: "frq_1", key: "5_day", name: "5", daysPerWeek: 5, courierDiscountPct: 0, weekdays: null }],
  durations: [{ id: BigInt(3), publicId: "dur_1", weeks: 1, discountPct: 0 }],
  zones: [],
  tiers: [{ minQty: 1, maxQty: 11, upliftPct: 20 }, { minQty: 12, maxQty: 19, upliftPct: 10 }, { minQty: 20, maxQty: null, upliftPct: 0 }],
};

const sel = (over: Partial<PricingSelections> = {}): PricingSelections => ({
  mealSizeId: "msz_1",
  frequencyKey: "5_day",
  persons: 1,
  mealSlots: ["lunch"],
  includeSaturday: false,
  includeSunday: false,
  durationWeeks: 1,
  startDate: "2026-06-23",
  ...over,
});

describe("buildPricingCatalog discounts", () => {
  const d = (key: string, kind: "delivery" | "duration", over = {}) => ({ key, name: key, kind, targetPublicId: null, percent: 10, minWeeks: null, ...over });
  const build = (discounts: CatalogSnapshot["discounts"], over: Partial<PricingSelections> = {}) => buildPricingCatalog({ ...snapshot, discounts, maxDiscountPct: 25 }, sel(over));
  it("resolves delivery + duration by target and labels them", () => {
    const c = build([d("a", "delivery", { targetPublicId: "frq_1" }), d("b", "duration", { targetPublicId: "dur_1", percent: 5 }), d("c", "delivery", { targetPublicId: "frq_other" })]);
    expect(c.discounts).toEqual([{ key: "a", label: "Delivery schedule discount (10%)", percent: 10 }, { key: "b", label: "Plan length discount (5%)", percent: 5 }]);
    expect(c.maxDiscountPct).toBe(25);
  });
  it("re-price snapshot with the order's own retired rows keeps its targeted discounts", () => {
    const retired = { ...snapshot, frequencies: [...snapshot.frequencies, { id: BigInt(7), publicId: "frq_old", key: "old", name: "Old", daysPerWeek: 3, courierDiscountPct: 0, weekdays: null }], durations: [...snapshot.durations, { id: BigInt(8), publicId: "dur_old", weeks: 6, discountPct: 0 }], discounts: [d("x", "delivery", { targetPublicId: "frq_old" }), d("y", "duration", { targetPublicId: "dur_old" })], maxDiscountPct: 25 };
    expect(buildPricingCatalog(retired, sel({ frequencyKey: "old", durationWeeks: 6 })).discounts?.map((x) => x.key)).toEqual(["x", "y"]);
  });
  it("respects minWeeks and null target", () => {
    expect(build([d("long", "duration", { minWeeks: 4 })]).discounts).toEqual([]);
    expect(build([d("all", "duration")]).discounts).toHaveLength(1);
  });
});

describe("buildPricingCatalog persons validation", () => {
  it("accepts 1–5", () => {
    expect(() => buildPricingCatalog(snapshot, sel({ persons: 5 }))).not.toThrow();
  });
  it("rejects 0 / negative", () => {
    expect(() => buildPricingCatalog(snapshot, sel({ persons: 0 }))).toThrow(ValidationError);
    expect(() => buildPricingCatalog(snapshot, sel({ persons: -2 }))).toThrow(ValidationError);
  });
  it("rejects above 5 and non-integers", () => {
    expect(() => buildPricingCatalog(snapshot, sel({ persons: 9999 }))).toThrow(ValidationError);
    expect(() => buildPricingCatalog(snapshot, sel({ persons: 2.5 }))).toThrow(ValidationError);
  });
  it("rejects empty categories", () => {
    expect(() => buildPricingCatalog(snapshot, sel({ mealSlots: [] }))).toThrow("At least one category is required");
  });
  it("throws ValidationError, not TypeError, for a retired duration", () => {
    expect(() => buildPricingCatalog(snapshot, sel({ durationWeeks: 9 }))).toThrow(ValidationError);
  });
  it("still validates meal size / frequency / duration", () => {
    expect(() => buildPricingCatalog(snapshot, sel({ mealSizeId: "nope" }))).toThrow(ValidationError);
  });
});
