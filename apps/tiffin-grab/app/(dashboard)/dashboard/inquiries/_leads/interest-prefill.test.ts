import { describe, it, expect } from "vitest";
import { interestToPrefill } from "./interest-prefill";

const catalog = {
  plans: [{ key: "veg_weekly", name: "Veg Weekly" }],
  mealSizes: [{ id: "ms_1", name: "Large" }],
};
const base = {
  planInterest: null, mealSizeInterest: null, personsInterest: null,
  preferredStart: null, postalCode: null, quotedPrice: null,
};

describe("interestToPrefill", () => {
  it("matches plan/meal-size by name (case-insensitive)", () => {
    const { prefill, unmatched } = interestToPrefill(
      { ...base, planInterest: "veg weekly", mealSizeInterest: "LARGE" }, catalog);
    expect(prefill.planKey).toBe("veg_weekly");
    expect(prefill.mealSizeId).toBe("ms_1");
    expect(unmatched).toEqual([]);
  });
  it("pushes unmatched free-text to unmatched, leaves keys unset", () => {
    const { prefill, unmatched } = interestToPrefill(
      { ...base, planInterest: "keto deluxe" }, catalog);
    expect(prefill.planKey).toBeUndefined();
    expect(unmatched).toContain("Plan: keto deluxe");
  });
  it("passes through persons, start, postal; surfaces quoted price", () => {
    const { prefill, unmatched } = interestToPrefill(
      { ...base, personsInterest: 3, preferredStart: "2026-07-10", postalCode: "400001", quotedPrice: "4500.00" }, catalog);
    expect(prefill.persons).toBe(3);
    expect(prefill.startDate).toBe("2026-07-10");
    expect(prefill.postalCode).toBe("400001");
    expect(unmatched).toContain("Quoted price: 4500.00");
  });
});
