import { describe, expect, it } from "vitest";
import {
  cloverCentsToDollars,
  dollarsToCloverCents,
  normalizeCloverCategory,
  normalizeCloverItem,
  primaryCategoryName,
} from "../inventory";

describe("money helpers", () => {
  it("rounds dollars to cents", () => {
    expect(dollarsToCloverCents(12.99)).toBe(1299);
    expect(dollarsToCloverCents(0.1)).toBe(10);
    expect(dollarsToCloverCents(20)).toBe(2000);
  });

  it("converts cents to dollars", () => {
    expect(cloverCentsToDollars(1299)).toBe(12.99);
    expect(cloverCentsToDollars(10)).toBe(0.1);
  });
});

describe("normalizeCloverItem", () => {
  it("maps core fields and expanded categories", () => {
    const item = normalizeCloverItem({
      id: "ITEM1",
      name: "Caesar Salad",
      price: 1200,
      priceType: "FIXED",
      hidden: false,
      available: true,
      autoManage: true,
      sku: "SKU-1",
      code: "CODE-1",
      alternateName: "Caesar",
      cost: 400,
      unitName: "each",
      colorCode: "#FF0080",
      categories: {
        elements: [{ id: "CAT1", name: "Salads" }, { id: "CAT2", name: "Lunch" }],
      },
      itemStock: { quantity: 5 },
    });
    expect(item).toMatchObject({
      id: "ITEM1",
      name: "Caesar Salad",
      price: 1200,
      hidden: false,
      available: true,
      sku: "SKU-1",
      cost: 400,
      unitName: "each",
      colorCode: "#FF0080",
    });
    expect(primaryCategoryName(item)).toBe("Salads");
    expect(item.itemStock?.quantity).toBe(5);
  });

  it("rejects missing id/name", () => {
    expect(() => normalizeCloverItem({ name: "x", price: 1 })).toThrow(/missing id/);
    expect(() => normalizeCloverItem({ id: "1", price: 1 })).toThrow(/missing id or name/);
  });
});

describe("normalizeCloverCategory", () => {
  it("maps id and name", () => {
    expect(normalizeCloverCategory({ id: "C1", name: "Drinks" })).toEqual({
      id: "C1",
      name: "Drinks",
      sortOrder: undefined,
      modifiedTime: undefined,
    });
  });
});
