import { describe, expect, it } from "vitest";
import { toClientCatalog } from "../types";
import type { CatalogSnapshot } from "../types";

const snapshot: CatalogSnapshot = {
  plans: [{ id: 1n, publicId: "pln_veg", key: "veg", name: "Veg", description: null, planType: "tiffin", offeredSlots: [], allowedStartDays: [] }],
  mealSizes: [
    {
      id: 5n, publicId: "msz_small", key: "small", name: "Small", planId: 1n, planKey: "veg",
      tier: "budget", components: [], items: [], kcalMin: 400, kcalMax: 600,
      proteinG: null, carbsG: null, fatG: null, basePrice: 10, trial: false,
    },
  ],
  frequencies: [],
  durations: [],
  zones: [],
  tiers: [],
};

describe("toClientCatalog", () => {
  it("exposes planKey and strips server-only id/planId from meal sizes", () => {
    const client = toClientCatalog(snapshot);
    const m = client.mealSizes[0];
    expect(m.planKey).toBe("veg");
    expect("id" in m).toBe(false);
    expect("planId" in m).toBe(false);
    expect("diet" in m).toBe(false);
    expect("planType" in m).toBe(false);
  });
});
