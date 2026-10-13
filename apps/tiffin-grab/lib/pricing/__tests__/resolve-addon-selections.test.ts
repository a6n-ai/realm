import { describe, expect, it } from "vitest";
import { ValidationError } from "@foundry/commons";
import { resolveAddonSelections } from "../build-catalog";

const catalog = {
  plans: [{ key: "veg", offeredSlots: ["roti", "rice"] }],
  addonsByCategory: {
    roti: [{ key: "roti", name: "Roti", category: "roti", planKey: "veg", tuAmount: 0.25, pricePerTiffin: 0.5, maxQty: 20 }],
    rice: [{ key: "rice", name: "Rice", category: "rice", planKey: "veg", tuAmount: 1, pricePerTiffin: 1.05, maxQty: 5 }],
    salad: [{ key: "salad", name: "Salad", category: "salad", planKey: "veg", tuAmount: 1, pricePerTiffin: 1.05, maxQty: 5 }],
  },
};

describe("resolveAddonSelections", () => {
  it("returns the catalog's own name, price and cap for each pick", () => {
    expect(resolveAddonSelections(catalog, [{ key: "roti", qty: 2 }])).toEqual([
      { key: "roti", name: "Roti", category: "roti", planKey: "veg", tuAmount: 0.25, pricePerTiffin: 0.5, qty: 2, maxQty: 20 },
    ]);
  });

  it("rejects an add-on whose category the plan does not offer", () => {
    expect(() => resolveAddonSelections(catalog, [{ key: "salad", qty: 1 }])).toThrow(ValidationError);
  });

  it("rejects an unknown key", () => {
    expect(() => resolveAddonSelections(catalog, [{ key: "nope", qty: 1 }])).toThrow("Add-on not available: nope");
  });

  it.each([0, -1, 1.5, 6])("rejects quantity %s for an add-on capped at 5", (qty) => {
    expect(() => resolveAddonSelections(catalog, [{ key: "rice", qty }])).toThrow("Invalid quantity for Rice (1–5)");
  });
});
