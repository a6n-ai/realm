import { describe, expect, it } from "vitest";
import { dietsForPlanKey } from "../selections.service";

describe("dietsForPlanKey", () => {
  it("maps veg to veg only", () => {
    expect(dietsForPlanKey("veg")).toEqual(["veg"]);
  });

  it("maps non-veg to nonveg only", () => {
    expect(dietsForPlanKey("non-veg")).toEqual(["nonveg"]);
  });

  it("falls back to both diets for any other key (e.g. healthy)", () => {
    expect(dietsForPlanKey("healthy")).toEqual(["veg", "nonveg"]);
  });

  it("no longer special-cases the retired halal_nonveg/mixed keys", () => {
    expect(dietsForPlanKey("halal_nonveg")).toEqual(["veg", "nonveg"]);
    expect(dietsForPlanKey("mixed")).toEqual(["veg", "nonveg"]);
  });
});
