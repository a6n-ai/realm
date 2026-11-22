import { ValidationError } from "@foundry/commons";
import { describe, expect, it } from "vitest";
import { buildPricingCatalog } from "./build-catalog";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import { priceSubscription } from "./engine";
import type { PricingSelections } from "./types";

const snapshot: CatalogSnapshot = {
  plans: [],
  mealSizes: [
    { id: BigInt(1), publicId: "msz_1", key: "k", name: "K", description: null, planId: BigInt(1), planKey: "veg", tier: "budget", components: [], items: [], kcalMin: 1, kcalMax: 2, proteinG: null, carbsG: null, fatG: null, basePrice: 10, discountType: "none", discountValue: 0, trial: false, custom: false, priceable: true, servesWeekends: true },
  ],
  frequencies: [{ id: BigInt(2), publicId: "frq_1", key: "5_day", name: "5", daysPerWeek: 5, weekdays: null }],
  durations: [{ id: BigInt(3), publicId: "dur_1", weeks: 1 }],
  zones: [],
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
  const d = (key: string, kind: "delivery" | "duration", over = {}) => ({ key, name: key, kind, targetPublicId: null, percent: 10, minWeeks: null, minEatingDays: null, ...over });
  const build = (discounts: CatalogSnapshot["discounts"], over: Partial<PricingSelections> = {}) => buildPricingCatalog({ ...snapshot, discounts, maxDiscountPct: 25 }, sel(over));
  it("resolves delivery + duration by target and labels them", () => {
    const c = build([d("a", "delivery", { targetPublicId: "frq_1", name: "Launch offer" }), d("b", "duration", { targetPublicId: "dur_1", percent: 5, name: " " }), d("c", "delivery", { targetPublicId: "frq_other" })]);
    // The admin name is the customer label; a blank name falls back to the generic one.
    expect(c.discounts).toEqual([{ key: "a", label: "Launch offer (10%)", percent: 10 }, { key: "b", label: "Plan length discount (5%)", percent: 5 }]);
    expect(c.maxDiscountPct).toBe(25);
  });
  it("re-price snapshot with the order's own retired rows keeps its targeted discounts", () => {
    const retired = { ...snapshot, frequencies: [...snapshot.frequencies, { id: BigInt(7), publicId: "frq_old", key: "old", name: "Old", daysPerWeek: 3, weekdays: null }], durations: [...snapshot.durations, { id: BigInt(8), publicId: "dur_old", weeks: 6 }], discounts: [d("x", "delivery", { targetPublicId: "frq_old" }), d("y", "duration", { targetPublicId: "dur_old" })], maxDiscountPct: 25 };
    expect(buildPricingCatalog(retired, sel({ frequencyKey: "old", durationWeeks: 6 })).discounts?.map((x) => x.key)).toEqual(["x", "y"]);
  });
  it("respects minWeeks and null target", () => {
    expect(build([d("long", "duration", { minWeeks: 4 })]).discounts).toEqual([]);
    expect(build([d("all", "duration")]).discounts).toHaveLength(1);
  });
});

describe("buildPricingCatalog eating-day tiers", () => {
  const d = (key: string, kind: "delivery" | "duration", over = {}) => ({ key, name: key, kind, targetPublicId: null, percent: 10, minWeeks: null, minEatingDays: null, ...over });
  const mwf = { id: BigInt(4), publicId: "frq_mwf", key: "mwf", name: "MWF", daysPerWeek: 3, weekdays: ["mon", "wed", "fri"] };
  const tiered = [
    d("t4", "delivery", { targetPublicId: "frq_mwf", percent: 8, minEatingDays: 4 }),
    d("t5", "delivery", { targetPublicId: "frq_mwf", percent: 10, minEatingDays: 5 }),
    d("len", "duration", { targetPublicId: "dur_1", percent: 10 }),
  ] as CatalogSnapshot["discounts"];
  const snap = { ...snapshot, frequencies: [...snapshot.frequencies, mwf] as CatalogSnapshot["frequencies"], discounts: tiered, maxDiscountPct: 15 };
  const keys = (over: Partial<PricingSelections>) => buildPricingCatalog(snap, sel({ frequencyKey: "mwf", ...over })).discounts?.map((x) => x.key);
  it("MWF with eatingDays [mon,wed,fri] has no delivery discount line", () => expect(keys({ eatingDays: ["mon", "wed", "fri"] })).toEqual(["len"]));
  it("MWF with eatingDays mon-thu gets the 8% line", () => expect(keys({ eatingDays: ["mon", "tue", "wed", "thu"] })).toEqual(["t4", "len"]));
  it("MWF with eatingDays mon-fri gets only the 10% line", () => expect(keys({ eatingDays: ["mon", "tue", "wed", "thu", "fri"] })).toEqual(["t5", "len"]));
  it("no eatingDays falls back to daysPerWeek + weekend flags", () => {
    expect(keys({})).toEqual(["len"]);
    expect(keys({ includeSaturday: true })).toEqual(["t4", "len"]);
    expect(keys({ includeSaturday: true, includeSunday: true })).toEqual(["t5", "len"]);
  });
  it("cap still applies", () => {
    const s = sel({ frequencyKey: "mwf", eatingDays: ["mon", "tue", "wed", "thu", "fri"] });
    const priced = priceSubscription(s, buildPricingCatalog(snap, s));
    const off = priced.adjustments.reduce((t, a) => t + a.amount, 0);
    expect(Math.round((off / 50) * 100)).toBe(15);
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
