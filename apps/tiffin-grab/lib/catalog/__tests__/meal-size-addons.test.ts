import { describe, expect, it } from "vitest";
import { mealSizeAddons } from "../types";

const roti = { key: "extra_roti", name: "Extra Roti", pricePerWeek: 5, maxQty: 5 };
const raita = { key: "raita", name: "Raita", pricePerWeek: 3, maxQty: 2 };

describe("mealSizeAddons", () => {
  it("unions add-ons across the meal size's categories, deduped by key", () => {
    const byCategory = { roti: [roti], sabzi: [roti, raita] };
    expect(mealSizeAddons(byCategory, [{ category: "roti" }, { category: "sabzi" }, { category: "rice" }])).toEqual([roti, raita]);
  });

  it("offers nothing when no category has add-ons attached", () => {
    expect(mealSizeAddons(undefined, [{ category: "roti" }])).toEqual([]);
    expect(mealSizeAddons({ sabzi: [raita] }, [{ category: "roti" }])).toEqual([]);
  });
});
