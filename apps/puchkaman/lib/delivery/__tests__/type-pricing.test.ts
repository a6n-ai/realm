import { describe, it, expect } from "vitest";
import { applyTypeDiscount } from "../type-pricing";
import type { DeliveryType } from "../zones";

const instant: DeliveryType = {
  key: "instant",
  label: "Instant",
  requiresAddress: true,
  requiresSchedule: false,
  minSubtotal: 0,
  discountPct: 15,
  sortOrder: 1,
  active: true,
};

const scheduled: DeliveryType = {
  key: "scheduled",
  label: "Scheduled",
  requiresAddress: true,
  requiresSchedule: true,
  minSubtotal: 35,
  discountPct: 0,
  sortOrder: 2,
  active: true,
};

describe("applyTypeDiscount", () => {
  it("discounts the subtotal by the type percentage", () => {
    expect(applyTypeDiscount({ subtotal: 100, type: { ...instant, discountPct: 15 } })).toEqual({
      discountAmount: 15,
    });
  });

  it("is zero for a type with no discount", () => {
    expect(applyTypeDiscount({ subtotal: 100, type: scheduled })).toEqual({ discountAmount: 0 });
  });

  it("rounds to two decimals", () => {
    expect(
      applyTypeDiscount({ subtotal: 33.33, type: { ...instant, discountPct: 15 } }).discountAmount,
    ).toBe(5);
  });
});
