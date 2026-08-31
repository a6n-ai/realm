import { describe, it, expect } from "vitest";
import {
  ineligibleReason,
  couponValue,
  resolveCoupons,
  type CouponCandidate,
  type CouponContext,
} from "../index";

const NOW = Date.UTC(2026, 0, 1); // 2026-01-01T00:00:00Z

function candidate(overrides: Partial<CouponCandidate> = {}): CouponCandidate {
  return {
    id: "cpn_1",
    name: "Test",
    active: true,
    stackable: true,
    ...overrides,
  };
}

function ctx(overrides: Partial<CouponContext> = {}): CouponContext {
  return { subtotal: 100, now: NOW, ...overrides };
}

describe("ineligibleReason", () => {
  it("rejects inactive", () => {
    expect(ineligibleReason(candidate({ active: false }), ctx())).toBe("inactive");
  });

  it("rejects before startsAt", () => {
    const c = candidate({ startsAt: NOW + 1 });
    expect(ineligibleReason(c, ctx())).toBe("not_started");
  });

  it("allows exactly at startsAt", () => {
    const c = candidate({ startsAt: NOW });
    expect(ineligibleReason(c, ctx())).toBeNull();
  });

  it("rejects after expiresAt", () => {
    const c = candidate({ expiresAt: NOW - 1 });
    expect(ineligibleReason(c, ctx())).toBe("expired");
  });

  it("allows exactly at expiresAt", () => {
    const c = candidate({ expiresAt: NOW });
    expect(ineligibleReason(c, ctx())).toBeNull();
  });

  it("rejects below minSubtotal", () => {
    const c = candidate({ minSubtotal: 100.01 });
    expect(ineligibleReason(c, ctx({ subtotal: 100 }))).toBe("below_min_subtotal");
  });

  it("allows subtotal exactly equal to minSubtotal", () => {
    const c = candidate({ minSubtotal: 100 });
    expect(ineligibleReason(c, ctx({ subtotal: 100 }))).toBeNull();
  });

  it("rejects at global redemption cap", () => {
    const c = candidate({ maxRedemptions: 5, redemptionCount: 5 });
    expect(ineligibleReason(c, ctx())).toBe("redemption_limit");
  });

  it("allows just under global redemption cap", () => {
    const c = candidate({ maxRedemptions: 5, redemptionCount: 4 });
    expect(ineligibleReason(c, ctx())).toBeNull();
  });

  it("rejects at per-user cap", () => {
    const c = candidate({ maxPerUser: 1, userRedemptionCount: 1 });
    expect(ineligibleReason(c, ctx())).toBe("user_limit");
  });

  it("allows just under per-user cap", () => {
    const c = candidate({ maxPerUser: 1, userRedemptionCount: 0 });
    expect(ineligibleReason(c, ctx())).toBeNull();
  });

  it("rejects a payment method not in the allow-list", () => {
    const c = candidate({ allowedPaymentMethods: ["stripe"] });
    expect(ineligibleReason(c, ctx({ paymentMethod: "etransfer" }))).toBe("payment_method");
  });

  it("rejects a missing payment method when the list is non-empty", () => {
    const c = candidate({ allowedPaymentMethods: ["stripe"] });
    expect(ineligibleReason(c, ctx({ paymentMethod: null }))).toBe("payment_method");
  });

  it("allows any payment method when the list is empty", () => {
    const c = candidate({ allowedPaymentMethods: [] });
    expect(ineligibleReason(c, ctx({ paymentMethod: "anything" }))).toBeNull();
  });

  it("allows a fully eligible candidate", () => {
    expect(ineligibleReason(candidate(), ctx())).toBeNull();
  });
});

describe("couponValue", () => {
  it("computes percent off, rounded to cents", () => {
    const c = candidate({ percentOff: 12.5 });
    expect(couponValue(c, 33.33)).toBe(4.17); // 33.33 * 0.125 = 4.16625 -> 4.17
  });

  it("computes fixed amount off, rounded to cents", () => {
    const c = candidate({ amountOff: 10.005 });
    expect(couponValue(c, 100)).toBe(10.01);
  });

  it("percentOff takes precedence over amountOff when both are set", () => {
    const c = candidate({ percentOff: 10, amountOff: 50 });
    expect(couponValue(c, 100)).toBe(10);
  });

  it("falls back to amountOff when percentOff is zero", () => {
    const c = candidate({ percentOff: 0, amountOff: 5 });
    expect(couponValue(c, 100)).toBe(5);
  });

  it("is 0 with no value fields set", () => {
    expect(couponValue(candidate(), 100)).toBe(0);
  });
});

describe("resolveCoupons", () => {
  it("caps the total at subtotal when coupons exceed it", () => {
    const candidates = [
      candidate({ id: "a", amountOff: 60, stackable: true }),
      candidate({ id: "b", amountOff: 60, stackable: true }),
    ];
    const res = resolveCoupons(candidates, ctx({ subtotal: 100 }));
    expect(res.total).toBe(100);
    expect(res.applied.map((a) => a.amount)).toEqual([60, 40]);
  });

  it("reports rejected candidates with their reason", () => {
    const candidates = [
      candidate({ id: "a", active: false, amountOff: 10 }),
      candidate({ id: "b", amountOff: 10, minSubtotal: 1000 }),
    ];
    const res = resolveCoupons(candidates, ctx());
    expect(res.rejected).toEqual(
      expect.arrayContaining([
        { id: "a", reason: "inactive" },
        { id: "b", reason: "below_min_subtotal" },
      ]),
    );
    expect(res.applied).toEqual([]);
  });

  it("does not apply a zero-value eligible candidate", () => {
    const candidates = [candidate({ id: "a" })]; // no percentOff/amountOff
    const res = resolveCoupons(candidates, ctx());
    expect(res.applied).toEqual([]);
    expect(res.rejected).toEqual([]);
  });

  it("picks the stackable set when it beats a weaker exclusive", () => {
    const candidates = [
      candidate({ id: "s1", amountOff: 10, stackable: true }),
      candidate({ id: "s2", amountOff: 10, stackable: true }),
      candidate({ id: "ex", amountOff: 15, stackable: false }),
    ];
    const res = resolveCoupons(candidates, ctx({ subtotal: 100 }));
    expect(res.total).toBe(20);
    expect(res.applied.map((a) => a.id).sort()).toEqual(["s1", "s2"]);
  });

  it("picks a strong exclusive over a weaker stackable set", () => {
    const candidates = [
      candidate({ id: "s1", amountOff: 5, stackable: true }),
      candidate({ id: "ex", amountOff: 15, stackable: false }),
    ];
    const res = resolveCoupons(candidates, ctx({ subtotal: 100 }));
    expect(res.total).toBe(15);
    expect(res.applied.map((a) => a.id)).toEqual(["ex"]);
  });

  it("breaks ties deterministically by fewer coupons then id", () => {
    // Two singleton exclusives tie at 10; "ex1" wins on id ordering.
    const candidates = [
      candidate({ id: "ex2", amountOff: 10, stackable: false }),
      candidate({ id: "ex1", amountOff: 10, stackable: false }),
    ];
    const res = resolveCoupons(candidates, ctx({ subtotal: 100 }));
    expect(res.total).toBe(10);
    expect(res.applied.map((a) => a.id)).toEqual(["ex1"]);
  });

  it("breaks ties by fewer coupons when totals match", () => {
    // Stackable set of two totals 10; a single exclusive also totals 10.
    // Fewer coupons (the exclusive) should win the tie.
    const candidates = [
      candidate({ id: "s1", amountOff: 5, stackable: true }),
      candidate({ id: "s2", amountOff: 5, stackable: true }),
      candidate({ id: "ex", amountOff: 10, stackable: false }),
    ];
    const res = resolveCoupons(candidates, ctx({ subtotal: 100 }));
    expect(res.total).toBe(10);
    expect(res.applied.map((a) => a.id)).toEqual(["ex"]);
  });

  it("carries the code onto applied coupons that have one", () => {
    const candidates = [candidate({ id: "a", code: "SAVE10", amountOff: 10 })];
    const res = resolveCoupons(candidates, ctx());
    expect(res.applied[0]).toMatchObject({ id: "a", code: "SAVE10", amount: 10 });
  });
});
