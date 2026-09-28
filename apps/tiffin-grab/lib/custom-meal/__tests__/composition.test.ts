import { describe, expect, it } from "vitest";
import { compositionKey, compositionName, mealPlanKey, normalizeItems, type CategoryUnit } from "../composition";

const units = new Map<string, CategoryUnit>([
  ["sabzi", { key: "sabzi", label: "Sabzi", tuUnitType: "weight", tuUnitSize: 8, tuUnitLabel: "oz" }],
  ["roti", { key: "roti", label: "Roti", tuUnitType: "count", tuUnitSize: 4, tuUnitLabel: "roti" }],
  ["rice", { key: "rice", label: "Rice", tuUnitType: "count", tuUnitSize: 1, tuUnitLabel: "unit" }],
]);

describe("normalizeItems + compositionKey", () => {
  it("is order-independent", () => {
    const a = normalizeItems([
      { category: "sabzi", planKey: "veg", tuAmount: 1 },
      { category: "sabzi", planKey: "non-veg", tuAmount: 1.5 },
      { category: "roti", planKey: "non-veg", tuAmount: 1 },
    ], units);
    const b = normalizeItems([
      { category: "roti", planKey: "non-veg", tuAmount: 1 },
      { category: "sabzi", planKey: "non-veg", tuAmount: 1.5 },
      { category: "sabzi", planKey: "veg", tuAmount: 1 },
    ], units);
    expect(compositionKey(a)).toBe(compositionKey(b));
    expect(compositionKey(a)).toBe("roti:non-veg:1|sabzi:non-veg:1.5|sabzi:veg:1");
  });

  it("merges count-category rows into one row, keeps weight rows as picks", () => {
    const items = normalizeItems([
      { category: "roti", planKey: "veg", tuAmount: 1 },
      { category: "roti", planKey: "veg", tuAmount: 0.5 },
      { category: "sabzi", planKey: "veg", tuAmount: 1 },
      { category: "sabzi", planKey: "veg", tuAmount: 1 },
    ], units);
    expect(items).toEqual([
      { category: "roti", planKey: "veg", tuAmount: 1.5 },
      { category: "sabzi", planKey: "veg", tuAmount: 1 },
      { category: "sabzi", planKey: "veg", tuAmount: 1 },
    ]);
  });

  it("drops zero rows", () => {
    expect(normalizeItems([{ category: "rice", planKey: "veg", tuAmount: 0 }], units)).toEqual([]);
  });
});

describe("mealPlanKey", () => {
  it("is non-veg when any row is non-veg", () => {
    expect(mealPlanKey([{ category: "sabzi", planKey: "veg", tuAmount: 1 }, { category: "sabzi", planKey: "non-veg", tuAmount: 1 }])).toBe("non-veg");
    expect(mealPlanKey([{ category: "roti", planKey: "veg", tuAmount: 5 }])).toBe("veg");
  });
});

describe("compositionName", () => {
  it("reads like the WordPress product text, in natural units", () => {
    const items = normalizeItems([
      { category: "sabzi", planKey: "non-veg", tuAmount: 1.5 },
      { category: "sabzi", planKey: "veg", tuAmount: 1 },
      { category: "sabzi", planKey: "veg", tuAmount: 1 },
      { category: "roti", planKey: "non-veg", tuAmount: 1.5 },
      { category: "rice", planKey: "non-veg", tuAmount: 1 },
    ], units);
    expect(compositionName(items, units)).toBe("1 Rice + 6 Roti + 1× Non-Veg Sabzi 12oz + 2× Veg Sabzi 8oz");
  });
});
