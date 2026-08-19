import { describe, expect, it } from "vitest";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import { initialSelections, selectionsFromPriorOrder } from "../selections";

const catalog: ClientCatalogSnapshot = {
  plans: [
    {
      publicId: "pln_veg",
      key: "veg",
      name: "Veg",
      description: "Veg plan",
      planType: "tiffin",
      offeredSlots: ["lunch"],
      allowedStartDays: ["mon"],
    },
  ],
  mealSizes: [
    {
      publicId: "msz_maha",
      key: "maharaja",
      name: "Maharaja",
      description: null,
      planKey: "veg",
      tier: "premium",
      components: [],
      items: [],
      kcalMin: 400,
      kcalMax: 600,
      proteinG: null,
      carbsG: null,
      fatG: null,
      basePrice: 10,
      discountType: "none",
      discountValue: 0,
      trial: false,
    },
  ],
  frequencies: [],
  durations: [],
  zones: [],
};

describe("selectionsFromPriorOrder", () => {
  it("returns empty wizard state when there is no prior order", () => {
    expect(selectionsFromPriorOrder(catalog, null)).toEqual(initialSelections);
  });

  it("prefills plan, meal size, schedule, and duration; leaves start date empty", () => {
    const next = selectionsFromPriorOrder(catalog, {
      planKey: "veg",
      mealSizePublicId: "msz_maha",
      persons: 2,
      includeSaturday: true,
      includeSunday: false,
      durationWeeks: 4,
      frequencyKey: "mwf",
    });
    expect(next.planKey).toBe("veg");
    expect(next.mealSizeId).toBe("msz_maha");
    expect(next.persons).toBe(2);
    expect(next.includeSaturday).toBe(true);
    expect(next.frequencyKey).toBe("mwf");
    expect(next.durationWeeks).toBe(4);
    expect(next.mealSlots).toEqual(["lunch"]);
    expect(next.startDate).toBe("");
  });

  it("drops a retired meal size instead of carrying a stale id", () => {
    const next = selectionsFromPriorOrder(catalog, {
      planKey: "veg",
      mealSizePublicId: "msz_gone",
      persons: 1,
      includeSaturday: false,
      includeSunday: false,
      durationWeeks: 1,
      frequencyKey: "5_day",
    });
    expect(next.planKey).toBe("veg");
    expect(next.mealSizeId).toBe("");
  });
});
