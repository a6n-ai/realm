import { ValidationError } from "@tiffin/commons";
import { describe, expect, it } from "vitest";
import { buildPricingCatalog } from "./build-catalog";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import type { PricingSelections } from "./types";

const snapshot: CatalogSnapshot = {
  plans: [],
  mealSizes: [
    { id: BigInt(1), publicId: "msz_1", key: "k", name: "K", tier: "budget", diet: "veg", components: [], kcalMin: 1, kcalMax: 2, proteinG: null, carbsG: null, fatG: null, basePrice: 10 },
  ],
  addons: [
    { id: BigInt(10), publicId: "adn_sat", key: "saturday", name: "Sat", pricePerWeek: 15 },
    { id: BigInt(11), publicId: "adn_sun", key: "sunday", name: "Sun", pricePerWeek: 15 },
  ],
  frequencies: [{ id: BigInt(2), publicId: "frq_1", key: "5_day", name: "5", daysPerWeek: 5, courierDiscountPct: 0 }],
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
  ...over,
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
  it("rejects empty meal slots", () => {
    expect(() => buildPricingCatalog(snapshot, sel({ mealSlots: [] }))).toThrow(ValidationError);
  });
  it("still validates meal size / frequency / duration", () => {
    expect(() => buildPricingCatalog(snapshot, sel({ mealSizeId: "nope" }))).toThrow(ValidationError);
  });
});
