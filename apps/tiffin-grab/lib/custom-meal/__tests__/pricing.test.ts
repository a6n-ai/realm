import { describe, expect, it } from "vitest";
import { computeCustomPerTiffin, type CustomMealPricingRow } from "../pricing";

const rows: CustomMealPricingRow[] = [
  { category: "sabzi", planKey: "veg", pricePerTu: 3, maxTu: 4 },
  { category: "sabzi", planKey: "non-veg", pricePerTu: 4.5, maxTu: 2 },
  { category: "roti", planKey: "veg", pricePerTu: 1.25, maxTu: null },
];

describe("computeCustomPerTiffin", () => {
  it("sums TU × price per TU, rounded to cents", () => {
    expect(computeCustomPerTiffin([
      { category: "sabzi", planKey: "veg", tuAmount: 1 },
      { category: "sabzi", planKey: "veg", tuAmount: 1 },
      { category: "sabzi", planKey: "non-veg", tuAmount: 1.5 },
      { category: "roti", planKey: "veg", tuAmount: 1.5 },
    ], rows)).toBe(14.63); // 3+3+6.75+1.875
  });

  it("rejects a category × diet with no pricing row", () => {
    expect(() => computeCustomPerTiffin([{ category: "rice", planKey: "veg", tuAmount: 1 }], rows)).toThrow(/Rice|rice/);
  });

  it("rejects a (category, diet) TU total above maxTu", () => {
    expect(() => computeCustomPerTiffin([
      { category: "sabzi", planKey: "non-veg", tuAmount: 1.5 },
      { category: "sabzi", planKey: "non-veg", tuAmount: 1 },
    ], rows)).toThrow(/at most 2/);
  });

  it("rejects an empty meal", () => {
    expect(() => computeCustomPerTiffin([], rows)).toThrow(/at least one/i);
  });
});
