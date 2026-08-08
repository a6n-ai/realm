import { describe, it, expect } from "vitest";
import { rowToZone } from "../zones.service";

describe("rowToZone", () => {
  it("converts numeric strings from the DB into numbers", () => {
    const zone = rowToZone({
      name: "Standard",
      radiusKm: "7.00",
      feeAmount: "0.00",
      discountPct: "15.00",
      minSubtotal: "0.00",
      requiresScheduling: false,
      active: true,
    });
    expect(zone).toEqual({
      name: "Standard",
      radiusKm: 7,
      feeAmount: 0,
      discountPct: 15,
      minSubtotal: 0,
      requiresScheduling: false,
      active: true,
    });
  });
});
