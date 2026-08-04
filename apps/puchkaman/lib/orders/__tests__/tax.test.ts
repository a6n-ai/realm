import { describe, expect, it } from "vitest";
import { computeTax, type TaxRateRow, type TaxableLine } from "../tax";

// Mirrors the live merchant: one default 13% rate plus decoys that must never be
// picked up by name (two rows are both called "Tax", two both "Marketplace Tax").
const HST: TaxRateRow = {
  cloverTaxRateId: "PNF6CV7VAK4GT",
  name: "Tax",
  rate: "13.00000",
  taxAmount: null,
  isDefault: true,
};
const NON_DEFAULT_HST: TaxRateRow = { ...HST, cloverTaxRateId: "3QYV42531Z1HP", isDefault: false };
const MARKETPLACE_25: TaxRateRow = {
  cloverTaxRateId: "V2S2W1JBKKF0C",
  name: "Marketplace Tax",
  rate: "25.00000",
  taxAmount: null,
  isDefault: false,
};
const FLAT_1C: TaxRateRow = {
  cloverTaxRateId: "C7JJP9BQ81H8R",
  name: "Restaurant Tax",
  rate: null,
  taxAmount: 1,
  isDefault: false,
};
const NO_TAX: TaxRateRow = {
  cloverTaxRateId: "X22ZHV06QJ0YA",
  name: "NO_TAX_APPLIED",
  rate: "0.00000",
  taxAmount: null,
  isDefault: false,
};

const RATES = [HST, NON_DEFAULT_HST, MARKETPLACE_25, FLAT_1C, NO_TAX];

const line = (over: Partial<TaxableLine> = {}): TaxableLine => ({
  lineTotal: 9.99,
  quantity: 1,
  useDefaultRates: true,
  rateIds: [],
  ...over,
});

describe("computeTax", () => {
  // Both figures captured from a live atomic_order/checkouts response.
  it("matches Clover for a single default-rate item", () => {
    expect(computeTax([line()], RATES).tax).toBe(1.3); // 999c x 13% = 129.87 -> 130
  });

  it("matches Clover for a discounted cart", () => {
    // 2 x $9.99 = 1998c, less 300c discount = 1698c net, x13% = 220.74 -> 221
    expect(computeTax([line({ lineTotal: 19.98, quantity: 2 })], RATES, 3).tax).toBe(2.21);
  });

  it("rounds once on the grouped net, not per line", () => {
    // 3 x 50c: per-line would be 3 x (6.5 -> 7) = 21c; grouped is 150c x 13% = 19.5 -> 20c
    const lines = [line({ lineTotal: 0.5 }), line({ lineTotal: 0.5 }), line({ lineTotal: 0.5 })];
    expect(computeTax(lines, RATES).tax).toBe(0.2);
  });

  it("uses explicit associations instead of the default rate", () => {
    const out = computeTax([line({ rateIds: [MARKETPLACE_25.cloverTaxRateId] })], RATES);
    expect(out.tax).toBe(2.5); // 999c x 25% = 249.75 -> 250
    expect(out.perRate).toEqual([
      { cloverTaxRateId: "V2S2W1JBKKF0C", name: "Marketplace Tax", amount: 2.5 },
    ]);
  });

  it("charges no tax when the product opts out of default rates", () => {
    expect(computeTax([line({ useDefaultRates: false })], RATES).tax).toBe(0);
  });

  it("applies flat tax per unit, not per line", () => {
    const out = computeTax(
      [line({ lineTotal: 29.97, quantity: 3, useDefaultRates: false, rateIds: [FLAT_1C.cloverTaxRateId] })],
      RATES,
    );
    expect(out.tax).toBe(0.03);
  });

  it("sums multiple rates on one line", () => {
    const out = computeTax(
      [line({ rateIds: [HST.cloverTaxRateId, MARKETPLACE_25.cloverTaxRateId] })],
      RATES,
    );
    expect(out.tax).toBe(3.8); // 130 + 250
  });

  it("ignores a zero-rate row like NO_TAX_APPLIED", () => {
    const out = computeTax([line({ rateIds: [NO_TAX.cloverTaxRateId] })], RATES);
    expect(out.tax).toBe(0);
    expect(out.perRate).toEqual([]);
  });

  it("never resolves a rate by name — duplicate names must not collide", () => {
    // "Tax" exists twice; asking for the non-default id must not pull in the default too.
    const out = computeTax([line({ rateIds: [NON_DEFAULT_HST.cloverTaxRateId] })], RATES);
    expect(out.perRate).toHaveLength(1);
    expect(out.perRate[0].cloverTaxRateId).toBe("3QYV42531Z1HP");
  });

  it("skips unknown rate ids rather than throwing", () => {
    expect(computeTax([line({ rateIds: ["GONE"] })], RATES).tax).toBe(0);
  });

  it("never taxes below zero when the discount exceeds the subtotal", () => {
    expect(computeTax([line()], RATES, 999).tax).toBe(0);
  });

  it("returns zero tax for an empty cart", () => {
    expect(computeTax([], RATES).tax).toBe(0);
  });
});
