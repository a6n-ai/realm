import { describe, expect, it } from "vitest";
import { rateFor, tiffinFoodCost, type CostRate } from "../food-cost";

const VEG = 1n;
const NONVEG = 2n;

const rates: CostRate[] = [
  { category: "sabzi", planId: null, organizationId: null, costBase: 0, costPerTu: 2.2 },
  { category: "sabzi", planId: NONVEG, organizationId: null, costBase: 0.55, costPerTu: 2.2 },
  { category: "daal", planId: null, organizationId: null, costBase: 0.54, costPerTu: 1.04 },
  { category: "rice", planId: null, organizationId: null, costBase: 0, costPerTu: 1.05 },
  { category: "salad", planId: null, organizationId: null, costBase: 1.05, costPerTu: 0 },
  { category: "raita", planId: null, organizationId: null, costBase: 1.05, costPerTu: 0 },
  { category: "roti", planId: null, organizationId: null, costBase: 0, costPerTu: 1.2 },
];

const typicalVegTiffin = [
  { category: "sabzi", planId: VEG, tu: 1.5 },
  { category: "daal", planId: VEG, tu: 1 },
  { category: "rice", planId: VEG, tu: 1 },
  { category: "salad", planId: VEG, tu: 1 },
  { category: "raita", planId: VEG, tu: 1 },
  { category: "roti", planId: VEG, tu: 1 },
];

describe("tiffinFoodCost", () => {
  it("matches the owner's sheet", () => {
    const c = (category: string, tu: number, planId = VEG) => tiffinFoodCost([{ category, planId, tu }], rates, null).cost;
    expect(c("sabzi", 1)).toBeCloseTo(2.2);
    expect(c("sabzi", 1.5)).toBeCloseTo(3.3);
    expect(c("sabzi", 1, NONVEG)).toBeCloseTo(2.75);
    expect(c("sabzi", 1.5, NONVEG)).toBeCloseTo(3.85);
    expect(c("daal", 1)).toBeCloseTo(1.58);
    expect(c("daal", 1.5)).toBeCloseTo(2.1);
    expect(c("rice", 1)).toBeCloseTo(1.05);
    expect(c("salad", 1)).toBeCloseTo(1.05);
    expect(c("roti", 1)).toBeCloseTo(1.2);
  });

  it("prices a typical veg tiffin at 9.23", () => {
    expect(tiffinFoodCost(typicalVegTiffin, rates, null).cost).toBeCloseTo(9.23);
  });

  it("lists unrated categories and costs them 0", () => {
    const picks = [...typicalVegTiffin, { category: "protein", planId: VEG, tu: 1 }];
    const result = tiffinFoodCost(picks, rates, null);
    expect(result.unrated).toEqual(["protein"]);
    expect(result.cost).toBeCloseTo(9.23);
  });

  it("treats a null-TU slot as unrated", () => {
    const result = tiffinFoodCost([{ category: "sabzi", planId: VEG, tu: null }], rates, null);
    expect(result).toEqual({ cost: 0, unrated: ["sabzi"] });
  });
});

describe("rateFor", () => {
  it("prefers the org rate, then global", () => {
    const withOrg = [...rates, { category: "sabzi", planId: null, organizationId: "o1", costBase: 0, costPerTu: 3 }];
    expect(rateFor(withOrg, "sabzi", VEG, "o1")?.costPerTu).toBe(3);
    expect(rateFor(withOrg, "sabzi", VEG, "o2")?.costPerTu).toBe(2.2);
  });

  it("prefers the plan rate over the category default", () => {
    expect(rateFor(rates, "sabzi", NONVEG, null)?.costBase).toBe(0.55);
  });
});
