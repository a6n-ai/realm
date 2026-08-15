import { describe, expect, it } from "vitest";
import { capRedemption } from "../service";

/**
 * The second cap only bites when the first `min` doesn't clamp (coins * rate
 * < orderTotal) but rounding coinsSpent back up pushes coinsSpent * rate over
 * orderTotal — see "re-caps after rounding" below, the only case here that
 * actually fails if the second cap is deleted. The other cases exercise
 * shape/rounding but pass either way.
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

  it("re-caps after the recompute pushes value back over the total (deleting the second cap alone breaks this)", () => {
    // 143 * 0.07 = 10.01, so the first cap clamps currencyValue to 10;
    // coinsSpent = round(10 / 0.07) = 143; recomputing coinsSpent * rate
    // gives 10.01 again, over `total` — only the second cap catches that.
    const out = capRedemption(143, 0.07, 10);
    expect(out.coinsSpent).toBe(143);
    expect(out.currencyValue).toBeLessThanOrEqual(10);
    expect(out.currencyValue).not.toBe(10.01);
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
