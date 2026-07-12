import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/catalog/load", () => ({
  loadCatalogSnapshot: vi.fn(async () => ({
    plans: [
      { id: 1n, publicId: "pln_veg", key: "veg", name: "Pure Vegetarian Plan", description: "Paneer, daal, rotis", planType: "tiffin", offeredSlots: [], allowedStartDays: [] },
      { id: 2n, publicId: "pln_nv", key: "non-veg", name: "Non-Veg Plan", description: "Chicken, mutton", planType: "tiffin", offeredSlots: [], allowedStartDays: [] },
    ],
    mealSizes: [
      { id: 1n, publicId: "msz_thali", key: "thali", name: "Small Thali", planId: 1n, planKey: "veg", tier: "budget", components: [], items: [{ name: "Paneer Butter Masala", category: "main", qty: 1, weightValue: null, weightUnit: null }], kcalMin: 400, kcalMax: 600, proteinG: null, carbsG: null, fatG: null, basePrice: 10, trial: false },
    ],
    frequencies: [], durations: [], zones: [], tiers: [],
  })),
}));

import { searchCatalog } from "../search-actions";

describe("searchCatalog", () => {
  it("matches a plan by name (case-insensitive)", async () => {
    const r = await searchCatalog("vegetarian");
    expect(r.plans.map((p) => p.key)).toContain("veg");
  });
  it("matches a meal by an item name", async () => {
    const r = await searchCatalog("paneer");
    expect(r.meals.some((m) => m.name === "Small Thali")).toBe(true);
  });
  it("returns empty for a blank query", async () => {
    expect(await searchCatalog("   ")).toEqual({ plans: [], meals: [] });
  });
});
