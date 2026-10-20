import { describe, expect, it } from "vitest";
import { earnCoins } from "../earn-coins";

describe("earnCoins", () => {
  it("pays pct of the pre-tax amount, in coins", () => {
    // $226 total incl. $26 tax → $200 base; 10% = $20; $0.10/coin = 200
    expect(earnCoins({ total: 226, taxTotal: 26, pct: 10, valuePerCoin: 0.1 })).toBe(200);
  });

  it("floors partial coins", () => {
    expect(earnCoins({ total: 10.05, taxTotal: 0, pct: 10, valuePerCoin: 0.1 })).toBe(10);
  });

  it("keeps exact results exact despite float error", () => {
    expect(earnCoins({ total: 30, taxTotal: 0, pct: 10, valuePerCoin: 0.1 })).toBe(30);
  });

  it("is 0 when off, unpriced, or nothing was paid before tax", () => {
    expect(earnCoins({ total: 200, taxTotal: 0, pct: 0, valuePerCoin: 0.1 })).toBe(0);
    expect(earnCoins({ total: 200, taxTotal: 0, pct: 10, valuePerCoin: null })).toBe(0);
    expect(earnCoins({ total: 13, taxTotal: 13, pct: 10, valuePerCoin: 0.1 })).toBe(0);
  });
});
