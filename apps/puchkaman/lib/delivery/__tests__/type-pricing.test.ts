import { describe, it, expect } from "vitest";
import { applyTypeDiscount, PICKUP_TYPE_KEY } from "../type-pricing";
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

const pickup: DeliveryType = {
  key: PICKUP_TYPE_KEY,
  label: "Pickup",
  requiresAddress: false,
  requiresSchedule: false,
  minSubtotal: 0,
  discountPct: 20,
  sortOrder: 0,
  active: true,
};

describe("applyTypeDiscount", () => {
  // Pickup is a delivery_types row like any other. Its discount used to be
  // unreachable: only the delivery branch of createCheckout applied one, so a
  // pickup discount set in Settings was quoted nowhere and charged never.
  it("discounts a pickup order by its own percentage", () => {
    expect(applyTypeDiscount({ subtotal: 25, type: pickup })).toEqual({ discountAmount: 5 });
  });

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
