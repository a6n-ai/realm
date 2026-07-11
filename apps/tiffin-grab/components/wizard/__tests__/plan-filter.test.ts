import { describe, expect, it } from "vitest";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import { selectablePlans } from "../plan-filter";

function meal(key: string, planType: "tiffin" | "healthy", diet: "veg" | "nonveg" | "both") {
  return {
    publicId: `msz_${key}`, key, name: key, planType, tier: "budget" as const, diet,
    components: [], items: [], kcalMin: 400, kcalMax: 600,
    proteinG: null, carbsG: null, fatG: null, basePrice: 10, trial: false,
  };
}

function plan(key: string, planType: "tiffin" | "healthy") {
  return { publicId: `pln_${key}`, key, name: key, description: null, planType, offeredSlots: [], allowedStartDays: [] };
}

// Mirrors the seed: veg/halal_nonveg/mixed are tiffin plans; healthy is a healthy
// plan; all meal sizes are tiffin. Healthy has no sizes → must be hidden.
const catalog: ClientCatalogSnapshot = {
  plans: [plan("veg", "tiffin"), plan("halal_nonveg", "tiffin"), plan("mixed", "tiffin"), plan("healthy", "healthy")],
  mealSizes: [meal("small_thali", "tiffin", "veg"), meal("nonveg_4", "tiffin", "nonveg")],
  frequencies: [], durations: [], zones: [],
};

describe("selectablePlans", () => {
  it("hides plan types with no meal sizes (Healthy) and keeps tiffin plans", () => {
    const keys = selectablePlans(catalog).map((p) => p.key);
    expect(keys).toEqual(["veg", "halal_nonveg", "mixed"]);
    expect(keys).not.toContain("healthy");
  });

  it("keeps a veg plan only when a veg/both size exists for its plan type", () => {
    const nonvegOnly: ClientCatalogSnapshot = {
      ...catalog,
      mealSizes: [meal("nonveg_4", "tiffin", "nonveg")],
    };
    expect(selectablePlans(nonvegOnly).map((p) => p.key)).toEqual(["halal_nonveg", "mixed"]);
  });
});
