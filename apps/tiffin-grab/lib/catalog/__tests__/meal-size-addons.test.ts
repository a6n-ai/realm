import { describe, expect, it } from "vitest";
import { mealSizeAddons } from "../types";

const rice = { key: "rice", name: "Rice", category: "rice", tuAmount: 1, pricePerTiffin: 1, maxQty: 5 };
const vegSabzi = { key: "veg_sabzi_8oz", name: "8oz Veg Sabzi", category: "sabzi", planKey: "veg", tuAmount: 1, pricePerTiffin: 2, maxQty: 5 };
const plans = [
  { key: "veg", offeredSlots: ["sabzi", "rice", "roti"] },
  { key: "non-veg", offeredSlots: ["sabzi", "rice", "roti"] },
  { key: "healthy", offeredSlots: ["grain", "protein", "salad"] },
];
const catalog = { plans, addonsByCategory: { rice: [rice], sabzi: [vegSabzi] } };

describe("mealSizeAddons", () => {
  it("offers add-ons for the plan's menu, not just the meal size's own rows", () => {
    expect(mealSizeAddons(catalog, { planKey: "non-veg" })).toEqual([rice, vegSabzi]);
  });

  it("a plan-bound add-on shows on every plan; an unbound one only where the plan menu has its category", () => {
    expect(mealSizeAddons(catalog, { planKey: "healthy" })).toEqual([vegSabzi]);
  });

  it("offers nothing without add-ons or for an unknown plan", () => {
    expect(mealSizeAddons({ plans }, { planKey: "veg" })).toEqual([]);
    expect(mealSizeAddons({ plans: [], addonsByCategory: { rice: [rice] } }, { planKey: "veg" })).toEqual([]);
  });
});
