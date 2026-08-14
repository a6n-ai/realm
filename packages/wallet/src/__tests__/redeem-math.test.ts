import { describe, expect, it } from "vitest";
import { capRedemption } from "../service";

/**
 * A non-round rate makes coinsSpent * rate exceed the order total after
 * rounding, which is why the cap is applied twice. These cases fail if the
 * second cap is ever dropped as redundant.
 */
describe("capRedemption", () => {
  it("spends every coin when the value is under the order total", () => {
    expect(capRedemption(100, 0.05, 50)).toEqual({ coinsSpent: 100, currencyValue: 5 });
  });

  it("caps at the order total when the coins are worth more", () => {
    const out = capRedemption(1000, 0.05, 10);
    expect(out.currencyValue).toBeLessThanOrEqual(10);
  });

  it("re-caps after rounding, so a non-round rate cannot exceed the total", () => {
    const total = 10;
    const out = capRedemption(999, 0.03, total);
    expect(out.currencyValue).toBeLessThanOrEqual(total);
  });

  it("never returns a negative or fractional coin count", () => {
    const out = capRedemption(7, 0.03, 100);
    expect(Number.isInteger(out.coinsSpent)).toBe(true);
    expect(out.coinsSpent).toBeGreaterThanOrEqual(0);
  });

  it("rounds currency to two decimals", () => {
    const out = capRedemption(33, 0.07, 100);
    expect(out.currencyValue).toBe(Number(out.currencyValue.toFixed(2)));
  });
});
