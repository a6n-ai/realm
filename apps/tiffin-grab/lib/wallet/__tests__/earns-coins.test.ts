import { describe, expect, it } from "vitest";
import { earnsOrderCoins } from "../earns-coins";

describe("earnsOrderCoins", () => {
  it("pays only when money was actually paid", () => {
    expect(earnsOrderCoins({ total: "120.00", paymentStatus: "paid" })).toBe(true);
    expect(earnsOrderCoins({ total: "120.00", paymentStatus: "simulated_paid" })).toBe(true);
  });

  it("pays nothing for a $0 order (coins or a coupon covered it)", () => {
    expect(earnsOrderCoins({ total: "0.00", paymentStatus: "paid" })).toBe(false);
    expect(earnsOrderCoins({ total: 0, paymentStatus: null })).toBe(false);
  });

  it("pays nothing while the payment is unsettled or missing", () => {
    expect(earnsOrderCoins({ total: "120.00", paymentStatus: "awaiting_payment" })).toBe(false);
    expect(earnsOrderCoins({ total: "120.00", paymentStatus: "pending_verification" })).toBe(false);
    expect(earnsOrderCoins({ total: "120.00", paymentStatus: null })).toBe(false);
  });
});
