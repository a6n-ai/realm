import { describe, expect, it } from "vitest";
import { BELOW_COST_ERROR, maxDiscountAboveCost, mealCostFloor } from "../cost-floor";

describe("mealCostFloor", () => {
  it("multiplies cost per tiffin by count", () => {
    expect(mealCostFloor(4.5, 20)).toBe(90);
  });

  it("is null when cost is unset or count is empty", () => {
    expect(mealCostFloor(null, 20)).toBeNull();
    expect(mealCostFloor(undefined, 20)).toBeNull();
    expect(mealCostFloor(4.5, 0)).toBeNull();
    expect(mealCostFloor(Number.NaN, 10)).toBeNull();
  });
});

describe("maxDiscountAboveCost", () => {
  it("caps discount so net stays at the floor", () => {
    expect(maxDiscountAboveCost(100, 70)).toBe(30);
    expect(maxDiscountAboveCost(100, 120)).toBe(0);
    expect(maxDiscountAboveCost(100, null)).toBeNull();
  });
});

describe("BELOW_COST_ERROR", () => {
  it("is the staff-facing reject reason", () => {
    expect(BELOW_COST_ERROR).toMatch(/below cost/i);
  });
});
