import { describe, expect, it } from "vitest";
import { assertValidTiers, findTier, type PricingTier } from "./tiers";

const good: PricingTier[] = [
  { minQty: 1, maxQty: 11, upliftPct: 20 },
  { minQty: 12, maxQty: 19, upliftPct: 10 },
  { minQty: 20, maxQty: null, upliftPct: 0 },
];

describe("assertValidTiers", () => {
  it("accepts a contiguous cover starting at 1 with one unbounded top", () => {
    expect(() => assertValidTiers(good)).not.toThrow();
  });
  it("rejects when the first band does not start at 1", () => {
    expect(() => assertValidTiers([{ minQty: 2, maxQty: null, upliftPct: 0 }])).toThrow();
  });
  it("rejects a gap between bands", () => {
    expect(() => assertValidTiers([
      { minQty: 1, maxQty: 10, upliftPct: 10 },
      { minQty: 12, maxQty: null, upliftPct: 0 },
    ])).toThrow();
  });
  it("rejects an overlap between bands", () => {
    expect(() => assertValidTiers([
      { minQty: 1, maxQty: 12, upliftPct: 10 },
      { minQty: 10, maxQty: null, upliftPct: 0 },
    ])).toThrow();
  });
  it("rejects when there is no unbounded top band", () => {
    expect(() => assertValidTiers([{ minQty: 1, maxQty: 19, upliftPct: 0 }])).toThrow();
  });
  it("rejects a negative uplift", () => {
    expect(() => assertValidTiers([{ minQty: 1, maxQty: null, upliftPct: -1 }])).toThrow();
  });
});

describe("findTier", () => {
  it("matches the band containing the quantity", () => {
    expect(findTier(good, 11).upliftPct).toBe(20);
    expect(findTier(good, 12).upliftPct).toBe(10);
    expect(findTier(good, 24).upliftPct).toBe(0);
  });
  it("throws when no band matches (qty below 1)", () => {
    expect(() => findTier(good, 0)).toThrow();
  });
});
