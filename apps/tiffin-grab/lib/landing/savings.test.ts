import { describe, expect, it } from "vitest";
import type { CatalogSnapshot, MealSizeView } from "@/lib/catalog/types";
import { promoSavings } from "./savings";

const size = (n: number, price: number): MealSizeView => ({
  id: BigInt(n), publicId: `msz_${n}`, key: `k${n}`, name: `K${n}`, description: null, planId: BigInt(1), planKey: "veg", tier: "budget",
  components: [], items: [], kcalMin: 1, kcalMax: 2, proteinG: null, carbsG: null, fatG: null, basePrice: price,
  discountType: "none", discountValue: 0, trial: false, custom: false, priceable: true, servesWeekends: false,
});
const dur = (weeks: number) => ({ id: BigInt(100 + weeks), publicId: `dur_${weeks}`, weeks });
const off = (key: string, kind: "delivery" | "duration", target: string, percent: number) => ({ key, name: key, kind, targetPublicId: target, percent, minWeeks: null });

// Prod rules on 2026-11-06: MWF 5%, 6w 9%, 8w 10%, 12w 15%; WELCOME10 $25 on $200+.
const snapshot: CatalogSnapshot = {
  plans: [{ id: BigInt(1), publicId: "pln_veg", key: "veg", name: "Veg", description: null, planType: "tiffin", offeredSlots: ["lunch"], allowedStartDays: [] }],
  mealSizes: [size(1, 10), size(2, 12.8), size(3, 16)],
  frequencies: [
    { id: BigInt(10), publicId: "frq_5", key: "5_day", name: "5 Days/Wk", daysPerWeek: 5, weekdays: ["mon", "tue", "wed", "thu", "fri"] },
    { id: BigInt(11), publicId: "frq_mwf", key: "mwf", name: "MWF", daysPerWeek: 3, weekdays: ["mon", "wed", "fri"] },
  ],
  durations: [dur(4), dur(6), dur(8), dur(12)],
  zones: [],
  discounts: [off("mwf", "delivery", "frq_mwf", 5), off("w6", "duration", "dur_6", 9), off("w8", "duration", "dur_8", 10), off("w12", "duration", "dur_12", 15)],
  maxDiscountPct: 25,
};
const welcome = { code: "WELCOME10", valuePct: null, valueAmount: "25.00", minSubtotal: "200.00" };

describe("promoSavings", () => {
  it("claims less than the weakest 8-week plan at the typical price, with checkout's own lines", () => {
    const s = promoSavings(snapshot, welcome)!;
    // $12.80 x 24 MWF tiffins = $307.20; 5% + 10% = $46.08; + $25 = $71.08 (Mon to Fri saves $76.20).
    expect(s.total).toBe(71.08);
    expect(s.headline).toBe("Save over $70");
    expect(s.example).toBe("8 weeks, Mon, Wed, Fri");
    expect(s.lines).toEqual([
      { label: "Mon, Wed, Fri (5%)", amount: 15.36 },
      { label: "8-week plan (10%)", amount: 30.72 },
      { label: "Code WELCOME10", amount: 25 },
    ]);
    // $16 x 60 tiffins, 15% + $25.
    expect(s.upTo).toBe(169);
  });

  it("leaves the coupon out when the plan is under its minimum after discounts", () => {
    const small = { ...snapshot, mealSizes: [size(1, 8)] };
    // $8 x 24 = $192, 15% off = $163.20 < $200.
    expect(promoSavings(small, welcome)!.lines.map((l) => l.label)).not.toContain("Code WELCOME10");
  });

  it("never rounds up to a figure the plan does not reach", () => {
    const even = { ...snapshot, mealSizes: [size(1, 12.5)], discounts: [off("w8", "duration", "dur_8", 10)] };
    // $12.50 x 24 = $300 MWF: $30 + $25 = $55 exactly, so "over $50", not "over $55".
    expect(promoSavings(even, welcome)!.headline).toBe("Save over $50");
  });
});
