import { describe, expect, it } from "vitest";
import { NO_DROP_OFF } from "@/lib/catalog/drop-off";
import type { OrderFormValues } from "../../order-schema";
import { buildOrderInput, missingFields, type OrderInputCtx } from "../order-draft";

const values = {
  planKey: "veg",
  mealSizeId: "std",
  frequencyKey: "weekdays",
  eatingDays: ["mon", "wed", "sat"],
  persons: 1,
  mealSlots: ["lunch"],
  includeSaturday: false,
  includeSunday: false,
  durationWeeks: 4,
  startDate: "2026-11-02",
  addonSelections: [{ key: "raita", qty: 1 }],
  email: "a@b.co",
  addressLine: "1 Main St",
  city: "Toronto",
  postalCode: "M5V 1A1",
} as OrderFormValues;

const ctx: OrderInputCtx = {
  mealSizes: [{ id: "std", name: "Standard", diet: "veg" }, { id: "trial", name: "Trial", diet: "veg", trial: true }],
  trialFrequencyKey: "trial-freq",
  trialPicks: ["tue", "thu"],
  contact: { fullName: "Asha Rao", phone: "555" },
  notes: "  buzz 12  ",
  addressTagId: null,
  dropOff: NO_DROP_OFF,
  addressPublicId: null,
  realPayments: true,
  paymentMethodId: "etransfer",
  couponCodes: ["A1"],
  repInfo: null,
  discount: 0,
};

describe("buildOrderInput", () => {
  it("coins: sends the count only when staff chose some", () => {
    expect(buildOrderInput(values, ctx)).not.toHaveProperty("coins");
    expect(buildOrderInput(values, { ...ctx, coins: 0 })).not.toHaveProperty("coins");
    expect(buildOrderInput(values, { ...ctx, coins: 40 }).coins).toBe(40);
  });

  it("weekly plan: weekend flags come from eating days", () => {
    const o = buildOrderInput(values, ctx);
    expect(o.selections.frequencyKey).toBe("weekdays");
    expect(o.selections.eatingDays).toEqual(["mon", "wed", "sat"]);
    expect(o.selections.includeSaturday).toBe(true);
    expect(o.selections.includeSunday).toBe(false);
    expect(o.selections.addonSelections).toEqual([{ key: "raita", qty: 1 }]);
    expect(o.selections).not.toHaveProperty("trialDays");
    expect(o.couponCodes).toEqual(["A1"]);
  });

  it("trial: trial frequency, picks as eating days, trialDays, no add-ons or weekends", () => {
    const o = buildOrderInput({ ...values, mealSizeId: "trial" }, ctx);
    expect(o.selections.frequencyKey).toBe("trial-freq");
    expect(o.selections.eatingDays).toEqual(["tue", "thu"]);
    expect(o.selections.trialDays).toBe(2);
    expect(o.selections.addonSelections).toEqual([]);
    expect(o.selections.includeSaturday).toBe(false);
  });

  it("repCoupon only when available and a discount is set", () => {
    const rep = { available: true, code: "REP", name: "Rep", capPct: 10, capAmount: 20 } as OrderInputCtx["repInfo"];
    expect(buildOrderInput(values, { ...ctx, repInfo: rep, discount: 5 }).repCoupon).toEqual({ code: "REP", requestedAmount: 5 });
    expect(buildOrderInput(values, { ...ctx, repInfo: rep, discount: 0 }).repCoupon).toBeUndefined();
    expect(buildOrderInput(values, { ...ctx, repInfo: null, discount: 5 }).repCoupon).toBeUndefined();
  });

  it("payment method only when real methods exist", () => {
    expect(buildOrderInput(values, ctx).paymentMethodId).toBe("etransfer");
    expect(buildOrderInput(values, { ...ctx, realPayments: false }).paymentMethodId).toBeNull();
  });

  it("delivery instructions are trimmed, null when blank", () => {
    expect(buildOrderInput(values, ctx).contact.deliveryInstructions).toBe("buzz 12");
    expect(buildOrderInput(values, { ...ctx, notes: "   " }).contact.deliveryInstructions).toBeNull();
  });
});

describe("missingFields", () => {
  const base = { estimateOnly: false, mealSizeId: "std", startDate: "2026-11-02", isTrial: false, trialStartOk: true, addressLine: "x", city: "y", postalCode: "z", realPayments: true, paymentMethodId: "p" };

  it("order page asks only for meal and start date", () => {
    expect(missingFields({ ...base, page: "order", mealSizeId: "", startDate: "", addressLine: "" })).toEqual(["meal size", "start date"]);
  });

  it("payment page adds address and payment method", () => {
    expect(missingFields({ ...base, page: "payment", addressLine: "", city: "", postalCode: "", paymentMethodId: null }))
      .toEqual(["address", "city", "postal code", "payment method"]);
  });

  it("trial start must land on a trial day", () => {
    expect(missingFields({ ...base, page: "order", isTrial: true, trialStartOk: false })).toEqual(["a start date on a trial day"]);
  });

  it("estimate never needs a start date or address", () => {
    expect(missingFields({ ...base, estimateOnly: true, startDate: "", addressLine: "", isTrial: true, trialStartOk: false })).toEqual([]);
  });

  it("no page set means one page: everything counts", () => {
    expect(missingFields({ ...base, startDate: "", city: "" })).toEqual(["start date", "city"]);
  });
});
