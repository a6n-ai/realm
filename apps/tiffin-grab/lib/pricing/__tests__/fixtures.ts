import type { PricingCatalog, PricingSelections } from "../types";

export const catalog = (basePrice = 10, freqKey: "5_day" | "mwf" = "5_day", courierDiscountPct = 0, extra: Partial<PricingCatalog> = {}): PricingCatalog => ({
  mealSize: { id: "m1", basePrice },
  frequency: freqKey === "5_day" ? { key: "5_day", daysPerWeek: 5 } : { key: "mwf", daysPerWeek: 3 },
  addons: [],
  discounts: courierDiscountPct > 0 ? [{ key: "delivery_x", label: `Delivery schedule discount (${courierDiscountPct}%)`, percent: courierDiscountPct }] : [],
  maxDiscountPct: 25,
  ...extra,
});

export const sel = (over: Partial<PricingSelections> = {}): PricingSelections => ({
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
