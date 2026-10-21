import { describe, expect, it } from "vitest";
import { referralCoins } from "../reward";

describe("referralCoins", () => {
  it("flat mode pays the value whatever the order", () => {
    expect(referralCoins({ mode: "flat", value: 25, total: 999, taxTotal: 50, valuePerCoin: 0.1 })).toBe(25);
  });

  it("pct mode pays that percent of the pre-tax total in coins", () => {
    expect(referralCoins({ mode: "pct", value: 10, total: 113, taxTotal: 13, valuePerCoin: 1 })).toBe(10);
  });

  it("pct mode with no coin value pays nothing", () => {
    expect(referralCoins({ mode: "pct", value: 10, total: 113, taxTotal: 13, valuePerCoin: null })).toBe(0);
  });

  it("a 0 value pays nothing", () => {
    expect(referralCoins({ mode: "flat", value: 0, total: 113, taxTotal: 13, valuePerCoin: 1 })).toBe(0);
  });

  it("pct mode survives the float edge (30 × 10% ÷ 0.1)", () => {
    expect(referralCoins({ mode: "pct", value: 10, total: 30, taxTotal: 0, valuePerCoin: 0.1 })).toBe(30);
  });
});
