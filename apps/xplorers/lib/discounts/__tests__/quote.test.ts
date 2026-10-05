import { describe, expect, it } from "vitest";
import { CODE_ERROR_MESSAGE, capAdjustments, priceBooking, type CouponRule, type DiscountRule } from "../quote";

const NOW = Date.UTC(2026, 9, 5);
const cash = { id: "cash", kind: "manual" as const, enabled: true, label: "Cash", taxes: [{ name: "GST", ratePct: 10 }] };
const kids = { id: 1n, category: "kids" as const };

function rule(over: Partial<DiscountRule> = {}): DiscountRule {
  return {
    publicId: "dsc_1",
    name: "Kids 10%",
    scope: "all",
    category: null,
    sessionId: null,
    percentOff: 10,
    amountOff: null,
    minSubtotal: null,
    startsAt: null,
    endsAt: null,
    stackable: true,
    active: true,
    ...over,
  };
}

function coupon(over: Partial<CouponRule> = {}): CouponRule {
  return {
    publicId: "cpn_1",
    code: "SAVE5",
    name: "Save $5",
    percentOff: null,
    amountOff: 5,
    minSubtotal: null,
    maxRedemptions: null,
    maxPerUser: null,
    redemptionCount: 0,
    userRedemptionCount: 0,
    allowedPaymentMethods: [],
    startsAt: null,
    expiresAt: null,
    stackable: true,
    active: true,
    ...over,
  };
}

const base = {
  unitPrice: "50",
  seats: 2,
  session: kids,
  method: cash,
  discounts: [] as DiscountRule[],
  coupon: null as CouponRule | null,
  codeTyped: false,
  maxDiscountPct: 100,
  now: NOW,
};

describe("priceBooking", () => {
  it("charges price × seats plus tax when nothing applies", () => {
    expect(priceBooking(base)).toEqual({ subtotal: 100, adjustments: [], discountTotal: 0, taxTotal: 10, total: 110, codeError: null });
  });

  it("rejects a negative class price", () => {
    expect(() => priceBooking({ ...base, unitPrice: -1 })).toThrow(/price/i);
  });

  it("applies only discounts whose scope matches the class", () => {
    const q = priceBooking({
      ...base,
      discounts: [
        rule({ publicId: "dsc_cat", scope: "category", category: "kids" }),
        rule({ publicId: "dsc_adults", scope: "category", category: "adults", percentOff: 50 }),
        rule({ publicId: "dsc_other", scope: "session", sessionId: 2n, percentOff: 50 }),
      ],
    });
    expect(q.adjustments.map((a) => a.publicId)).toEqual(["dsc_cat"]);
    expect(q.discountTotal).toBe(10);
  });

  it("taxes the discounted subtotal", () => {
    const q = priceBooking({ ...base, discounts: [rule()] });
    expect(q).toMatchObject({ subtotal: 100, discountTotal: 10, taxTotal: 9, total: 99 });
  });

  it("stacks a stackable coupon on a stackable discount", () => {
    const q = priceBooking({ ...base, discounts: [rule()], coupon: coupon(), codeTyped: true });
    expect(q.discountTotal).toBe(15);
    expect(q.adjustments.find((a) => a.kind === "coupon")).toMatchObject({ code: "SAVE5", amount: 5 });
    expect(q.codeError).toBeNull();
  });

  it("reports superseded when an exclusive coupon loses to a better discount", () => {
    const q = priceBooking({ ...base, discounts: [rule({ percentOff: 30 })], coupon: coupon({ stackable: false }), codeTyped: true });
    expect(q.discountTotal).toBe(30);
    expect(q.codeError).toBe("superseded");
  });

  it("reports not_found when a code was typed but no coupon matched", () => {
    expect(priceBooking({ ...base, codeTyped: true }).codeError).toBe("not_found");
  });

  it("reports the engine reason for an ineligible coupon", () => {
    expect(priceBooking({ ...base, coupon: coupon({ expiresAt: NOW - 1 }), codeTyped: true }).codeError).toBe("expired");
    expect(priceBooking({ ...base, coupon: coupon({ maxRedemptions: 1, redemptionCount: 1 }), codeTyped: true }).codeError).toBe(
      "redemption_limit",
    );
    expect(priceBooking({ ...base, coupon: coupon({ maxPerUser: 1, userRedemptionCount: 1 }), codeTyped: true }).codeError).toBe(
      "user_limit",
    );
    expect(priceBooking({ ...base, coupon: coupon({ minSubtotal: 500 }), codeTyped: true }).codeError).toBe("below_min_subtotal");
    expect(priceBooking({ ...base, coupon: coupon({ allowedPaymentMethods: ["etransfer"] }), codeTyped: true }).codeError).toBe(
      "payment_method",
    );
  });

  it("never goes below zero and drops tax to zero when fully discounted", () => {
    const q = priceBooking({ ...base, unitPrice: "20", seats: 1, coupon: coupon({ amountOff: 50 }), codeTyped: true });
    expect(q).toMatchObject({ subtotal: 20, discountTotal: 20, taxTotal: 0, total: 0, codeError: null });
  });

  it("clips the stack to the cap", () => {
    const q = priceBooking({
      ...base,
      discounts: [rule({ percentOff: 20 })],
      coupon: coupon({ amountOff: 20 }),
      codeTyped: true,
      maxDiscountPct: 25,
    });
    expect(q.discountTotal).toBe(25);
    expect(q.total).toBe(82.5);
  });

  it("charges no tax when there is no payment method", () => {
    expect(priceBooking({ ...base, method: null })).toMatchObject({ taxTotal: 0, total: 100 });
  });
});

describe("capAdjustments", () => {
  it("trims the last adjustment first and drops zeroed lines", () => {
    const out = capAdjustments(
      [
        { kind: "discount", publicId: "a", name: "A", amount: 20 },
        { kind: "coupon", publicId: "b", name: "B", code: "B", amount: 5 },
      ],
      100,
      20,
    );
    expect(out).toEqual([{ kind: "discount", publicId: "a", name: "A", amount: 20 }]);
  });

  it("leaves adjustments under the cap untouched", () => {
    const adj = [{ kind: "discount" as const, publicId: "a", name: "A", amount: 10 }];
    expect(capAdjustments(adj, 100, 50)).toBe(adj);
  });
});

describe("CODE_ERROR_MESSAGE", () => {
  it("has a plain message for every code error", () => {
    for (const msg of Object.values(CODE_ERROR_MESSAGE)) expect(msg.length).toBeGreaterThan(5);
    expect(Object.keys(CODE_ERROR_MESSAGE)).toHaveLength(9);
  });
});
