import { describe, it, expect } from "vitest";
import { applyZonePricing } from "../zone-pricing";
import type { Zone } from "../zones";

const zone = (over: Partial<Zone> = {}): Zone => ({
  name: "Z",
  radiusKm: 7,
  feeAmount: 0,
  discountPct: 0,
  minSubtotal: 0,
  requiresScheduling: false,
  active: true,
  ...over,
});

describe("applyZonePricing", () => {
  it("discounts the subtotal by the zone percentage", () => {
    expect(applyZonePricing({ subtotal: 100, zone: zone({ discountPct: 15 }) })).toEqual({
      discountAmount: 15,
      feeAmount: 0,
    });
  });

  it("adds the fee without discounting it", () => {
    expect(
      applyZonePricing({ subtotal: 100, zone: zone({ discountPct: 15, feeAmount: 5 }) }),
    ).toEqual({ discountAmount: 15, feeAmount: 5 });
  });

  it("rounds money to two decimals", () => {
    expect(
      applyZonePricing({ subtotal: 33.33, zone: zone({ discountPct: 15 }) }).discountAmount,
    ).toBe(5);
  });
});
