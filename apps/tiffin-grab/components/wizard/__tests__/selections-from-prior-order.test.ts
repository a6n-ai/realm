import { describe, expect, it } from "vitest";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import { initialSelections, selectionsFromPriorOrder, reconcileSelections } from "../selections";

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
      custom: false,
      priceable: true, servesWeekends: true,
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

  it("prefills plan, meal size, and duration; leaves start date empty", () => {
    const next = selectionsFromPriorOrder(catalog, {
      planKey: "veg",
      mealSizePublicId: "msz_maha",
      persons: 1,
      includeSaturday: false,
      includeSunday: false,
      durationWeeks: 4,
      frequencyKey: "5_day",
    });
    expect(next.planKey).toBe("veg");
    expect(next.mealSizeId).toBe("msz_maha");
    expect(next.durationWeeks).toBe(4);
    expect(next.mealSlots).toEqual(["lunch"]);
    expect(next.startDate).toBe("");
  });

  // The wizard no longer offers persons, weekend delivery, or the MWF frequency.
  // A prior order placed when it did must not carry those forward: the controls
  // are gone, so the customer would be quoted for a plan they cannot see or undo.
  it("does not carry over options the wizard no longer sells", () => {
    const next = selectionsFromPriorOrder(catalog, {
      planKey: "veg",
      mealSizePublicId: "msz_maha",
      persons: 4,
      includeSaturday: true,
      includeSunday: true,
      durationWeeks: 4,
      frequencyKey: "mwf",
    });
    expect(next.persons).toBe(1);
    expect(next.includeSaturday).toBe(false);
    expect(next.includeSunday).toBe(false);
    // Frequency resets to the wizard default, which is now one delivery day a
    // week (was 5_day). Renewal re-picks the schedule fresh either way.
    expect(next.frequencyKey).toBe("");
    expect(next.eatingDays).toEqual(["mon", "tue", "wed", "thu", "fri"]);
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

  it("never carries a custom size into renewal; only staff create custom meals", () => {
    const custom = { ...catalog.mealSizes[0], publicId: "msz_custom", custom: true, kcalMin: 0, kcalMax: 0 };
    const prior = {
      planKey: "veg", mealSizePublicId: "msz_custom", persons: 1,
      includeSaturday: false, includeSunday: false, durationWeeks: 2, frequencyKey: "5_day",
    };
    expect(selectionsFromPriorOrder({ ...catalog, mealSizes: [...catalog.mealSizes, custom] }, prior).mealSizeId).toBe("");
  });
});

describe("reconcileSelections", () => {
  const durations = [{ publicId: "d4", weeks: 4 }, { publicId: "d12", weeks: 12 }, { publicId: "d2", weeks: 2 }, { publicId: "d1", weeks: 1 }, { publicId: "d6", weeks: 6 }, { publicId: "d8", weeks: 8 }];
  const weeks = (n: number) => reconcileSelections({ durations }, { ...initialSelections, durationWeeks: n }).durationWeeks;

  it("snaps an imported length to the nearest offered one, shorter on a tie", () => {
    expect([3, 5, 7, 10, 11, 0].map(weeks)).toEqual([2, 4, 6, 8, 12, 1]);
  });

  it("keeps an offered length and returns an equal cart", () => {
    const s = { ...initialSelections, durationWeeks: 12 };
    expect(reconcileSelections({ durations }, s)).toEqual(s);
  });

  it("clears a retired meal size and frequency, and drops unknown add-ons and drop-offs", () => {
    const s = { ...initialSelections, planKey: "veg", mealSizeId: "gone", frequencyKey: "old", addonSelections: [{ key: "x", qty: 1 }], deliveryTagId: "t", deliveryStrategyIds: ["s"], addressTagId: "a" };
    const r = reconcileSelections({ plans: [{ publicId: "p", key: "veg", name: "Veg", description: null, planType: "tiffin", offeredSlots: ["sabzi"], allowedStartDays: [] }], mealSizes: [], frequencies: [], durations }, s);
    expect(r).toMatchObject({ planKey: "veg", mealSizeId: "", frequencyKey: "", addonSelections: [], deliveryTagId: null, deliveryStrategyIds: [], addressTagId: null, mealSlots: ["sabzi"] });
  });
});
