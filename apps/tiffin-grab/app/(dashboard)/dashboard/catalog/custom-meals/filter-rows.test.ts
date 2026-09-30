import { describe, expect, it } from "vitest";
import { filterPricingRows } from "./filter-rows";

const row = (categoryLabel: string, planKey: string, pricePerTu: number | null, active: boolean) => ({
  categoryKey: categoryLabel.toLowerCase(), categoryLabel, unitHint: "", planKey, planName: planKey, pricePerTu, maxTu: null, active,
});
const rows = [row("Sabzi", "veg", 9, true), row("Rice", "veg", 5, false), row("Daal", "non-veg", null, false)];

describe("filterPricingRows", () => {
  it("filters by search, diet and status together", () => {
    expect(filterPricingRows(rows, {}).length).toBe(3);
    expect(filterPricingRows(rows, { q: "ric" }).map((r) => r.categoryLabel)).toEqual(["Rice"]);
    expect(filterPricingRows(rows, { diet: "non-veg" }).map((r) => r.categoryLabel)).toEqual(["Daal"]);
    expect(filterPricingRows(rows, { status: "hidden,unpriced" }).map((r) => r.categoryLabel)).toEqual(["Rice", "Daal"]);
    expect(filterPricingRows(rows, { diet: "veg", status: "offered" }).map((r) => r.categoryLabel)).toEqual(["Sabzi"]);
  });
});
