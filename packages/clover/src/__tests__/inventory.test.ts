import { describe, expect, it } from "vitest";
import {
  cloverCentsToDollars,
  dollarsToCloverCents,
  normalizeCloverCategory,
  normalizeCloverDiscount,
  normalizeCloverItem,
  normalizeCloverModifier,
  normalizeCloverModifierGroup,
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
        elements: [{ id: "CAT1", name: "Salads", colorCode: "#00FF00" }, { id: "CAT2", name: "Lunch" }],
      },
      itemStock: { quantity: 5 },
      modifierGroups: { elements: [{ id: "MG1", name: "Extras" }] },
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
    expect(item.categories?.elements?.[0]?.colorCode).toBe("#00FF00");
    expect(item.modifierGroups?.elements?.[0]?.id).toBe("MG1");
  });

  it("rejects missing id/name", () => {
    expect(() => normalizeCloverItem({ name: "x", price: 1 })).toThrow(/missing id/);
    expect(() => normalizeCloverItem({ id: "1", price: 1 })).toThrow(/missing id or name/);
  });
});

describe("normalizeCloverCategory", () => {
  it("maps id, name, colorCode, and items", () => {
    expect(
      normalizeCloverCategory({
        id: "C1",
        name: "Drinks",
        sortOrder: 2,
        colorCode: "#FF0080",
        deleted: false,
        items: { elements: [{ id: "I1" }] },
      }),
    ).toEqual({
      id: "C1",
      name: "Drinks",
      sortOrder: 2,
      colorCode: "#FF0080",
      deleted: false,
      modifiedTime: undefined,
      parentCategory: undefined,
      items: { elements: [{ id: "I1" }] },
    });
  });
});

describe("normalizeCloverModifierGroup", () => {
  it("maps group + nested modifiers", () => {
    const group = normalizeCloverModifierGroup({
      id: "MG1",
      name: "Toppings",
      minRequired: 0,
      maxAllowed: 3,
      showByDefault: true,
      modifiers: {
        elements: [{ id: "M1", name: "Cheese", price: 100, available: true }],
      },
    });
    expect(group.id).toBe("MG1");
    expect(group.maxAllowed).toBe(3);
    expect(group.modifiers?.elements?.[0]).toMatchObject({
      id: "M1",
      name: "Cheese",
      price: 100,
    });
  });
});

describe("normalizeCloverModifier", () => {
  it("maps price and group ref", () => {
    expect(
      normalizeCloverModifier({
        id: "M1",
        name: "Extra",
        price: 50,
        modifierGroup: { id: "MG1" },
      }),
    ).toMatchObject({ id: "M1", name: "Extra", price: 50, modifierGroup: { id: "MG1" } });
  });
});

describe("normalizeCloverDiscount", () => {
  it("maps percentage and amount discounts", () => {
    expect(normalizeCloverDiscount({ id: "D1", name: "10% off", percentage: 10 })).toMatchObject({
      id: "D1",
      name: "10% off",
      percentage: 10,
    });
    expect(normalizeCloverDiscount({ id: "D2", name: "$1 off", amount: -100 })).toMatchObject({
      id: "D2",
      amount: -100,
    });
  });
});
