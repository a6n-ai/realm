import { describe, expect, it } from "vitest";
import { buildRows, discountStatus } from "./build-rows";

const NOW = 1_000_000;

describe("discountStatus", () => {
  it("orders inactive, scheduled, expired, active", () => {
    expect(discountStatus({ active: false, startsAt: null, endsAt: null }, NOW)).toBe("inactive");
    expect(discountStatus({ active: true, startsAt: NOW + 1, endsAt: null }, NOW)).toBe("scheduled");
    expect(discountStatus({ active: true, startsAt: null, endsAt: NOW - 1 }, NOW)).toBe("expired");
    expect(discountStatus({ active: true, startsAt: NOW - 1, endsAt: NOW + 1 }, NOW)).toBe("active");
  });
});

describe("buildRows", () => {
  it("merges discounts and coupons with readable targets and values", () => {
    const rows = buildRows({
      now: NOW,
      discounts: [
        { publicId: "d1", name: "Kids", scope: "category", category: "kids", sessionTitle: null, percentOff: "10.00", amountOff: null, active: true, startsAt: null, endsAt: null },
        { publicId: "d2", name: "Promo", scope: "session", category: null, sessionTitle: "Lego Lab", percentOff: null, amountOff: "5.00", active: true, startsAt: null, endsAt: null },
      ],
      coupons: [
        { publicId: "c1", code: "FALL", name: "Fall", percentOff: "15.00", amountOff: null, active: true, startsAt: null, expiresAt: NOW - 1, redemptionCount: 3, maxRedemptions: 10 },
      ],
    });
    expect(rows).toEqual([
      expect.objectContaining({ id: "d1", type: "discount", appliesTo: "Kids classes", value: "10% off", status: "active", href: "/dashboard/catalog/discounts/d1" }),
      expect.objectContaining({ id: "d2", type: "discount", appliesTo: "Lego Lab", value: "$5.00 off" }),
      expect.objectContaining({ id: "c1", type: "coupon", appliesTo: "Code FALL", value: "15% off", status: "expired", uses: "3 / 10", href: "/dashboard/discounts/coupons/c1" }),
    ]);
  });
});
