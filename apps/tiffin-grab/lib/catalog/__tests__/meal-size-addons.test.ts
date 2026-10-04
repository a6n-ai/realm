import { describe, expect, it } from "vitest";
import { mealSizeAddons } from "../types";

const rice = { key: "rice", name: "Rice", category: "rice", planKey: "veg", tuAmount: 1, pricePerTiffin: 1, maxQty: 5 };
const vegSabzi = { key: "veg_sabzi_8oz", name: "8oz Veg Sabzi", category: "sabzi", planKey: "veg", tuAmount: 1, pricePerTiffin: 2, maxQty: 5 };
const plans = [
  { key: "veg", offeredSlots: ["sabzi", "rice", "roti"] },
  { key: "non-veg", offeredSlots: ["sabzi", "rice", "roti"] },
  { key: "healthy", offeredSlots: ["grain", "protein", "salad"] },
];
const healthySabzi = { key: "healthy_sabzi", name: "Healthy Sabzi", category: "sabzi", planKey: "healthy", tuAmount: 1, pricePerTiffin: 2, maxQty: 5 };
const unbound = { key: "legacy", name: "Legacy", category: "rice", tuAmount: 1, pricePerTiffin: 1, maxQty: 5 };
const catalog = { plans, addonsByCategory: { rice: [rice, unbound], sabzi: [vegSabzi, healthySabzi] } };

describe("mealSizeAddons", () => {
  it("offers an add-on when its own plan's menu releases its category, never via the order's plan", () => {
    expect(mealSizeAddons(catalog)).toEqual([rice, vegSabzi]);
  });

  it("offers nothing without add-ons or when the add-on's plan is unknown", () => {
    expect(mealSizeAddons({ plans })).toEqual([]);
    expect(mealSizeAddons({ plans: [], addonsByCategory: { rice: [rice] } })).toEqual([]);
  });
});
