import { describe, expect, it } from "vitest";
import names from "./fixtures/wp-custom-meal-names.json";
import { parseCustomMealName } from "../parse-wp";
import type { CategoryUnit } from "../composition";

const units = new Map<string, CategoryUnit>([
  ["sabzi", { key: "sabzi", label: "Sabzi", tuUnitType: "weight", tuUnitSize: 8, tuUnitLabel: "oz" }],
  ["roti", { key: "roti", label: "Roti", tuUnitType: "count", tuUnitSize: 4, tuUnitLabel: "roti" }],
  ["rice", { key: "rice", label: "Rice", tuUnitType: "count", tuUnitSize: 1, tuUnitLabel: "unit" }],
]);
const withSides = new Map<string, CategoryUnit>([
  ...units,
  ["raita", { key: "raita", label: "Raita", tuUnitType: "weight", tuUnitSize: 8, tuUnitLabel: "oz" }],
  ["salad", { key: "salad", label: "Salad", tuUnitType: "weight", tuUnitSize: 8, tuUnitLabel: "oz" }],
]);

describe("parseCustomMealName", () => {
  it("parses the common shape", () => {
    expect(parseCustomMealName("Custom Meal - 1 Non-Veg(12oz) + 2 Veg(8oz) + 4 Rotis + 1 Rice", units)).toEqual([
      { category: "rice", planKey: "veg", tuAmount: 1 },
      { category: "roti", planKey: "veg", tuAmount: 1 },
      { category: "sabzi", planKey: "non-veg", tuAmount: 1.5 },
      { category: "sabzi", planKey: "veg", tuAmount: 1 },
      { category: "sabzi", planKey: "veg", tuAmount: 1 },
    ]);
  });

  it("tolerates 'Veg (8oz)' spacing and a lone roti count", () => {
    expect(parseCustomMealName("Custom Meal - 1 Veg (8oz)", units)).toEqual([{ category: "sabzi", planKey: "veg", tuAmount: 1 }]);
    expect(parseCustomMealName("Custom Meal - 20 Rotis", units)).toEqual([{ category: "roti", planKey: "veg", tuAmount: 5 }]);
    expect(parseCustomMealName("Custom Meal - 1 Roti", units)).toEqual([{ category: "roti", planKey: "veg", tuAmount: 0.25 }]);
  });

  it("accepts ' - ' separators, trailing dashes, and Curry/Sabzi/Chicken wording", () => {
    const veg8 = { category: "sabzi", planKey: "veg", tuAmount: 1 };
    const nv12 = { category: "sabzi", planKey: "non-veg", tuAmount: 1.5 };
    expect(parseCustomMealName("Custom Meal - 1 Non-Veg(12oz) Curry - 3 Rotis - ---", units)).toEqual([
      { category: "roti", planKey: "veg", tuAmount: 0.75 },
      nv12,
    ]);
    expect(parseCustomMealName("Custom Meal - 2 Veg Curries (8oz) - 4 Rotis - 1 Rice", units)).toEqual([
      { category: "rice", planKey: "veg", tuAmount: 1 },
      { category: "roti", planKey: "veg", tuAmount: 1 },
      veg8,
      veg8,
    ]);
    expect(parseCustomMealName("Custom Meal - 2 Veg Curries [8oz] - 6 Rotis - -", units)).toEqual([
      { category: "roti", planKey: "veg", tuAmount: 1.5 },
      veg8,
      veg8,
    ]);
    expect(parseCustomMealName("Custom Meal - 1 Non-Veg(12oz) Chicken + 1 Veg(8oz) Sabzi", units)).toEqual([nv12, veg8]);
    expect(parseCustomMealName("Custom Meal - 1 Veg Curry(12oz) - 2 Main Veg Curries (8oz)", units)).toEqual([
      { category: "sabzi", planKey: "veg", tuAmount: 1.5 },
      veg8,
      veg8,
    ]);
  });

  it("accepts size-first 'N 12oz NON VEG CURRY' and glued '6ROTIS'", () => {
    expect(parseCustomMealName("Custom Meal - 2 12oz NON VEG CURRIES - 1 8oz VEG MAIN CURRY - 1 RICE + 6ROTIS", units)).toEqual([
      { category: "rice", planKey: "veg", tuAmount: 1 },
      { category: "roti", planKey: "veg", tuAmount: 1.5 },
      { category: "sabzi", planKey: "non-veg", tuAmount: 1.5 },
      { category: "sabzi", planKey: "non-veg", tuAmount: 1.5 },
      { category: "sabzi", planKey: "veg", tuAmount: 1 },
    ]);
    expect(parseCustomMealName("Custom Meal - 1 12oz MAIN VEG CURRY - 1 NONVEG CURRY", units)).toBeNull();
  });

  it("counts rice containers/boxes as rice and 'Rotis Only' as roti", () => {
    expect(parseCustomMealName("Custom Meal - 2 Veg(8oz) + 1 Non-Veg(8oz) Curry - 2 Rice Containers - -", units)).toEqual([
      { category: "rice", planKey: "veg", tuAmount: 2 },
      { category: "sabzi", planKey: "non-veg", tuAmount: 1 },
      { category: "sabzi", planKey: "veg", tuAmount: 1 },
      { category: "sabzi", planKey: "veg", tuAmount: 1 },
    ]);
    expect(parseCustomMealName("Custom Meal - 20 Rotis Only - - - -", units)).toEqual([{ category: "roti", planKey: "veg", tuAmount: 5 }]);
  });

  it("rejects components the spec has no mapping for (unsized curries, dal, rice by oz, Trial)", () => {
    for (const name of [
      "Custom Meal - 2 Veg Curries - 8 Rotis - 1 Rice",
      "Custom Meal - 1 Non-Veg(12oz) + 1 Veg(12oz) Dal + 7 Rotis",
      "Custom Meal - 1 12oz VEG CURRY - 1 12oz Rice - -",
      "Custom Meal - Trial - 2 Veg(8oz) + 1 Non-Veg(8oz) Curry - 6 Rotis + 1 Rice",
    ]) expect(parseCustomMealName(name, withSides)).toBeNull();
  });

  it("parses raita and salad as one 8oz veg pick each, whatever the meal's diet (active legacy orders)", () => {
    expect(parseCustomMealName("Custom Meal - 1 Veg(12oz) + 3 Rotis + 1 Rice + 1 Salad", withSides)).toEqual([
      { category: "rice", planKey: "veg", tuAmount: 1 },
      { category: "roti", planKey: "veg", tuAmount: 0.75 },
      { category: "sabzi", planKey: "veg", tuAmount: 1.5 },
      { category: "salad", planKey: "veg", tuAmount: 1 },
    ]);
    for (const name of [
      "Custom Meal - 2 Non-Veg(8oz) + 1 Veg(12oz) + 1 Veg (8oz) + 8 Rotis + 1 Rice + 1 Raita + 1 Salad",
      "Custom Meal - 1 Non-Veg(8oz) + 2 Rotis + 1 Rice + 1 Raita",
      "Custom Meal - 1 Veg(12oz) + 1 Veg(8oz) + 8 Rotis + 1 Salad",
    ]) expect(parseCustomMealName(name, withSides)).not.toBeNull();
    expect(parseCustomMealName("Custom Meal - 1 Non-Veg(8oz) + 2 Rotis + 1 Rice + 1 Raita", withSides)).toContainEqual({
      category: "raita",
      planKey: "veg",
      tuAmount: 1,
    });
    expect(parseCustomMealName("Custom Meal - 1 Veg(12oz) veg + 2 Rotis", withSides)).toEqual([
      { category: "roti", planKey: "veg", tuAmount: 0.5 },
      { category: "sabzi", planKey: "veg", tuAmount: 1.5 },
    ]);
  });

  it("throws on raita/salad only when those units are missing", () => {
    expect(() => parseCustomMealName("Custom Meal - 2 Veg(8oz) + 1 Raita", units)).toThrow(/raita/);
    expect(parseCustomMealName("Custom Meal - 2 Veg(8oz) + 4 Rotis", units)).not.toBeNull();
  });

  it("returns null for free text it cannot map", () => {
    expect(parseCustomMealName("Custom Meal - 1 GOOD TIFFIN - - - -", units)).toBeNull();
    expect(parseCustomMealName("Custom Meal - ", units)).toBeNull();
  });

  it("parses or explicitly rejects every legacy name", () => {
    const unparsed = (names as string[]).filter((n) => parseCustomMealName(n, withSides) === null);
    // Every null here must be genuinely free text; review the list when this snapshot changes.
    expect(unparsed).toMatchSnapshot();
  });
});
