import { describe, expect, it } from "vitest";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import { selectablePlans } from "../plan-filter";

function meal(key: string, planKey: string) {
  return {
    publicId: `msz_${key}`, key, name: key, planKey, tier: "budget" as const,
    components: [], items: [], kcalMin: 400, kcalMax: 600,
    proteinG: null, carbsG: null, fatG: null, basePrice: 10, trial: false,
  };
}

function plan(key: string, planType: "tiffin" | "healthy") {
  return { publicId: `pln_${key}`, key, name: key, description: null, planType, offeredSlots: [], allowedStartDays: [] };
}

// Mirrors the seed: veg/non-veg are tiffin plans; healthy is a healthy plan.
// Every meal size is scoped to a single plan by planKey. A plan is selectable
// iff at least one meal size names its key. Healthy has no sizes → hidden.
const catalog: ClientCatalogSnapshot = {
  plans: [plan("veg", "tiffin"), plan("non-veg", "tiffin"), plan("healthy", "healthy")],
  mealSizes: [meal("small_thali", "veg"), meal("nonveg_4", "non-veg")],
  frequencies: [], durations: [], zones: [],
};

describe("selectablePlans", () => {
  it("hides plans with no meal sizes (Healthy) and keeps plans that have sizes", () => {
    const keys = selectablePlans(catalog).map((p) => p.key);
    expect(keys).toEqual(["veg", "non-veg"]);
    expect(keys).not.toContain("healthy");
  });

  it("keeps a plan only when a size with its planKey exists", () => {
    const nonvegOnly: ClientCatalogSnapshot = {
      ...catalog,
      mealSizes: [meal("nonveg_4", "non-veg")],
    };
    expect(selectablePlans(nonvegOnly).map((p) => p.key)).toEqual(["non-veg"]);
  });
});
