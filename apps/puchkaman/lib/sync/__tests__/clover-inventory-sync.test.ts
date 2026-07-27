import { describe, expect, it } from "vitest";
import {
  findSafeAutoMatch,
  mapCloverCategoryToLocal,
  normalizeProductName,
  pricesEqual,
} from "../clover-inventory-match";

describe("normalizeProductName", () => {
  it("collapses punctuation and case", () => {
    expect(normalizeProductName("  Spicy Puchka!! ")).toBe("spicy puchka");
  });
});

describe("mapCloverCategoryToLocal", () => {
  it("maps known labels and falls back to extra", () => {
    expect(mapCloverCategoryToLocal("Fusion Puchkas")).toBe("fusion");
    expect(mapCloverCategoryToLocal("Unknown Stuff")).toBe("extra");
  });
});

const incomingBase = {
  cloverItemId: "C1",
  category: "extra" as const,
  available: true,
  sku: null,
  code: null,
  alternateName: null,
  priceType: "FIXED",
  hidden: false,
  cloverAvailable: true,
  autoManage: null,
  cost: null,
  unitName: null,
  colorCode: null,
  stockQty: null,
};

describe("findSafeAutoMatch", () => {
  const base = {
    publicId: "prd_a",
    name: "Caesar Salad",
    price: "12.00",
  };

  it("auto-links unique name+price", () => {
    const result = findSafeAutoMatch(
      { ...incomingBase, name: "Caesar Salad", price: 12 },
      [base],
    );
    expect(result.kind).toBe("auto");
  });

  it("flags name-only match as ambiguous", () => {
    const result = findSafeAutoMatch(
      { ...incomingBase, name: "Caesar Salad", price: 14 },
      [base],
    );
    expect(result.kind).toBe("ambiguous");
  });

  it("returns none when no name match", () => {
    const result = findSafeAutoMatch(
      { ...incomingBase, name: "Greek Salad", price: 12 },
      [base],
    );
    expect(result.kind).toBe("none");
  });
});

describe("pricesEqual", () => {
  it("tolerates cent rounding", () => {
    expect(pricesEqual(12.99, 12.991)).toBe(true);
    expect(pricesEqual(12.99, 13)).toBe(false);
  });
});
