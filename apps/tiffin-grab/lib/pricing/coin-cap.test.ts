import { describe, expect, it } from "vitest";
import { coinCapMessage, quoteCoinCap } from "./coin-cap";

// 1 coin = $0.10 throughout.
const RATE = 0.1;

describe("quoteCoinCap — admin percentage limit", () => {
  it("caps coins at the admin share of the subtotal (the $100 @ 30% = $30 example)", () => {
    const q = quoteCoinCap({ subtotal: 100, remaining: 100, balance: 1000, rate: RATE, maxPct: 30 });
    expect(q.maxValue).toBe(30);
    expect(q.maxCoins).toBe(300);
    expect(q.limitedBy).toBe("admin_pct");
  });

  it("anchors the percentage on the raw subtotal, not what is left after coupons", () => {
    // $20 coupon already applied: 30% is still of $100, bounded by the $80 left.
    const q = quoteCoinCap({ subtotal: 100, remaining: 80, balance: 1000, rate: RATE, maxPct: 30 });
    expect(q.maxValue).toBe(30);
  });

  it("is bounded by what is left when the order is nearly covered", () => {
    const q = quoteCoinCap({ subtotal: 100, remaining: 10, balance: 1000, rate: RATE, maxPct: 30 });
    expect(q.maxValue).toBe(10);
    expect(q.limitedBy).toBe("order_total");
  });

  it("with no admin limit, coins may cover the whole remaining order", () => {
    const q = quoteCoinCap({ subtotal: 100, remaining: 100, balance: 5000, rate: RATE, maxPct: null });
    expect(q.maxValue).toBe(100);
    expect(q.limitedBy).toBe("order_total");
  });

  it("0% turns coin spending off", () => {
    const q = quoteCoinCap({ subtotal: 100, remaining: 100, balance: 1000, rate: RATE, maxPct: 0 });
    expect(q.maxCoins).toBe(0);
  });
});

describe("quoteCoinCap — balance", () => {
  it("never offers more coins than the wallet holds", () => {
    const q = quoteCoinCap({ subtotal: 100, remaining: 100, balance: 50, rate: RATE, maxPct: 30 });
    expect(q.maxCoins).toBe(50);
    expect(q.maxValue).toBe(5);
    expect(q.limitedBy).toBe("balance");
  });

  it("offers nothing to an empty or negative wallet", () => {
    expect(quoteCoinCap({ subtotal: 100, remaining: 100, balance: 0, rate: RATE, maxPct: 30 }).maxCoins).toBe(0);
    expect(quoteCoinCap({ subtotal: 100, remaining: 100, balance: -5, rate: RATE, maxPct: 30 }).maxCoins).toBe(0);
  });

  it("floors so the offered coins are never worth a cent more than the cap", () => {
    // $33.33 cap at $0.07/coin: 476 coins = $33.32, 477 would be $33.39.
    const q = quoteCoinCap({ subtotal: 111.1, remaining: 111.1, balance: 10_000, rate: 0.07, maxPct: 30 });
    expect(q.maxCoins).toBe(476);
    expect(q.maxValue).toBeLessThanOrEqual(33.33);
  });
});

describe("coinCapMessage", () => {
  it("explains the admin limit and how many coins stay in the wallet", () => {
    const q = quoteCoinCap({ subtotal: 100, remaining: 100, balance: 1000, rate: RATE, maxPct: 30 });
    expect(coinCapMessage(q, { balance: 1000, maxPct: 30 })).toBe(
      "Coins can cover up to 30% of your order subtotal, so you can use 300 coins here. The other 700 coins stay in your wallet.",
    );
  });

  it("explains when the order is simply fully covered", () => {
    const q = quoteCoinCap({ subtotal: 100, remaining: 10, balance: 1000, rate: RATE, maxPct: null });
    expect(coinCapMessage(q, { balance: 1000, maxPct: null })).toMatch(/only needs 100 coins/);
  });

  it("says nothing when every coin can be used", () => {
    const q = quoteCoinCap({ subtotal: 100, remaining: 100, balance: 50, rate: RATE, maxPct: 30 });
    expect(coinCapMessage(q, { balance: 50, maxPct: 30 })).toBeNull();
  });
});
