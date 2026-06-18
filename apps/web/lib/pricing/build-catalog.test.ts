import { ValidationError } from "@tiffin/commons";
import { describe, expect, it } from "vitest";
import { buildPricingCatalog } from "./build-catalog";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import type { PricingSelections } from "./types";

const snapshot: CatalogSnapshot = {
  plans: [],
  mealSizes: [
    { id: "m1", key: "k", name: "K", tier: "budget", diet: "veg", components: [], kcalMin: 1, kcalMax: 2, proteinG: null, carbsG: null, fatG: null, basePrice: 10 },
  ],
  addons: [
    { key: "saturday", name: "Sat", pricePerWeek: 15 },
    { key: "sunday", name: "Sun", pricePerWeek: 15 },
  ],
  frequencies: [{ id: "f1", key: "5_day", name: "5", daysPerWeek: 5, courierDiscountPct: 0 }],
  durations: [{ id: "d1", weeks: 1, discountPct: 0 }],
  zones: [],
};

const sel = (over: Partial<PricingSelections> = {}): PricingSelections => ({
  mealSizeId: "m1",
  frequencyKey: "5_day",
  dailyQty: 1,
  includeSaturday: false,
  includeSunday: false,
  isStudent: false,
  durationWeeks: 1,
  ...over,
});

describe("buildPricingCatalog dailyQty validation", () => {
  it("accepts 1–5", () => {
    expect(() => buildPricingCatalog(snapshot, sel({ dailyQty: 5 }))).not.toThrow();
  });
  it("rejects 0 / negative", () => {
    expect(() => buildPricingCatalog(snapshot, sel({ dailyQty: 0 }))).toThrow(ValidationError);
    expect(() => buildPricingCatalog(snapshot, sel({ dailyQty: -2 }))).toThrow(ValidationError);
  });
  it("rejects above 5 and non-integers", () => {
    expect(() => buildPricingCatalog(snapshot, sel({ dailyQty: 9999 }))).toThrow(ValidationError);
    expect(() => buildPricingCatalog(snapshot, sel({ dailyQty: 2.5 }))).toThrow(ValidationError);
  });
  it("still validates meal size / frequency / duration", () => {
    expect(() => buildPricingCatalog(snapshot, sel({ mealSizeId: "nope" }))).toThrow(ValidationError);
  });
});
