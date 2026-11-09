import { describe, expect, it } from "vitest";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import { biggestDurationOff, deliveryIsFree, lowestRate, paidDropOff, shortMoney, trialLength, trialOffer } from "./live-figures";

const cat = (c: Partial<CatalogSnapshot>) => c as CatalogSnapshot;
const strategy = (active: boolean, chargeValue: number) => ({ active, chargeValue }) as CatalogSnapshot["deliveryCharges"] extends infer D ? D extends { deliveryStrategies: (infer S)[] } ? S : never : never;

describe("deliveryIsFree", () => {
  it("is free with no base charge and no charging strategy", () => {
    expect(deliveryIsFree(cat({ deliveryCharges: { baseCharge: 0, deliveryStrategies: [strategy(false, 5), strategy(true, 0)] } as never }))).toBe(true);
  });
  it("is not free when a base charge or an active strategy charges", () => {
    expect(deliveryIsFree(cat({ deliveryCharges: { baseCharge: 3, deliveryStrategies: [] } as never }))).toBe(false);
    // A paid drop-off is the customer's pick at checkout: delivery itself is still free (named via paidDropOff).
    expect(deliveryIsFree(cat({ deliveryCharges: { baseCharge: 0, deliveryStrategies: [strategy(true, 4)] } as never }))).toBe(true);
  });
});

describe("biggestDurationOff", () => {
  it("takes the largest duration percent and ignores other kinds", () => {
    const discounts = [
      { kind: "duration", percent: 7 },
      { kind: "duration", percent: 15 },
      { kind: "frequency", percent: 20 },
    ] as CatalogSnapshot["discounts"];
    expect(biggestDurationOff(cat({ discounts }))).toBe(15);
    expect(biggestDurationOff(cat({ discounts: [] }))).toBeNull();
  });
});

describe("trialOffer / lowestRate", () => {
  const size = (publicId: string, basePrice: number, trial: boolean) =>
    ({ publicId, planKey: "veg", basePrice, trial, custom: false, discountType: null, discountValue: 0 }) as never;
  const catalog = cat({ plans: [{ key: "veg", planType: "tiffin" }] as never, mealSizes: [size("reg", 10, false), size("t2", 15, true), size("t1", 14, true)] });
  const on = { maxDays: 3, weekdays: ["mon", "wed", "fri"] };

  it("links the cheapest trial size as a quote", () => {
    expect(trialOffer(catalog, on)).toEqual({ href: "/subscribe?p=veg&m=t1", maxDays: 3, rate: 14 });
    expect(trialLength(trialOffer(catalog, on)!)).toBe("up to 3 days");
  });
  it("is null when trials are off", () => {
    expect(trialOffer(catalog, { maxDays: null, weekdays: [] })).toBeNull();
  });
  it("keeps trial sizes out of the from rate", () => {
    expect(lowestRate(cat({ ...catalog, mealSizes: [size("reg", 10, false), size("t", 8, true)] }))).toBe(10);
  });
});

describe("shortMoney", () => {
  it("drops cents on whole amounts", () => {
    expect(shortMoney(10, "CAD")).toBe("$10");
    expect(shortMoney(10.4, "CAD")).toBe("$10.40");
  });
});

describe("paidDropOff", () => {
  it("names the cheapest active paid drop-off, or null", () => {
    const s = (name: string, active: boolean, chargeValue: number) => ({ name, active, chargeValue });
    expect(paidDropOff(cat({ deliveryCharges: { baseCharge: 0, deliveryStrategies: [s("Frontdoor", true, 0), s("Upstairs", true, 1.5), s("Old", false, 0.5)] } as never }))).toEqual({ name: "Upstairs", charge: 1.5 });
    expect(paidDropOff(cat({ deliveryCharges: { baseCharge: 0, deliveryStrategies: [s("Frontdoor", true, 0)] } as never }))).toBeNull();
  });
});
