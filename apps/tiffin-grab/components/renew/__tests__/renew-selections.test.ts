import { describe, expect, it } from "vitest";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import { FIXED_PERSONS, firstBlockedStep } from "@/components/wizard/selections";
import { renewPageMode, renewSelections, type RenewSource } from "../renew-selections";

const catalog: ClientCatalogSnapshot = {
  plans: [{ publicId: "pln_veg", key: "veg", name: "Veg", description: "Veg plan", planType: "tiffin", offeredSlots: ["lunch"], allowedStartDays: ["mon"] }],
  mealSizes: [
    {
      publicId: "msz_maha", key: "maharaja", name: "Maharaja", description: null, planKey: "veg", tier: "premium",
      components: [], items: [], kcalMin: 400, kcalMax: 600, proteinG: null, carbsG: null, fatG: null,
      basePrice: 10, discountType: "none", discountValue: 0, trial: false, custom: false, priceable: true, servesWeekends: true,
    },
  ],
  frequencies: [{ publicId: "frq_5", key: "5_day", name: "5 day", daysPerWeek: 5, weekdays: ["mon", "tue", "wed", "thu", "fri"] }],
  durations: [{ publicId: "dur_1", weeks: 1 }, { publicId: "dur_2", weeks: 2 }, { publicId: "dur_4", weeks: 4 }],
  zones: [],
};

const src: RenewSource = {
  planKey: "veg", mealSizePublicId: "msz_maha", frequencyKey: "5_day",
  eatingDays: ["mon", "tue", "wed", "thu", "fri"], durationWeeks: 4, trialLength: null,
};
const start = "2026-11-02";

describe("renewSelections", () => {
  it("carries the prior plan over and fills the fixed fields", () => {
    const s = renewSelections(catalog, src, start)!;
    expect(s).toMatchObject({
      planKey: "veg", mealSizeId: "msz_maha", frequencyKey: "5_day", durationWeeks: 4, startDate: start,
      eatingDays: src.eatingDays, persons: FIXED_PERSONS, addonSelections: [], mealSlots: ["lunch"],
      includeSaturday: false, includeSunday: false,
    });
    expect(firstBlockedStep(catalog, s)).toBeNull();
  });

  it("sets weekend flags from eating days", () => {
    const wk = { ...catalog, frequencies: [{ publicId: "frq_7", key: "7_day", name: "7 day", daysPerWeek: 7, weekdays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] }] };
    const s = renewSelections(wk, { ...src, frequencyKey: "7_day", eatingDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] }, start)!;
    expect(s.includeSaturday).toBe(true);
    expect(s.includeSunday).toBe(true);
  });

  it("returns null for a trial", () => {
    expect(renewSelections(catalog, { ...src, trialLength: 3 }, start)).toBeNull();
  });

  it("returns null when the meal size is not listable for the plan", () => {
    expect(renewSelections(catalog, { ...src, mealSizePublicId: "msz_gone" }, start)).toBeNull();
    expect(renewSelections(catalog, { ...src, mealSizePublicId: null }, start)).toBeNull();
  });

  it("returns null when the frequency is not selectable", () => {
    expect(renewSelections(catalog, { ...src, frequencyKey: "mwf" }, start)).toBeNull();
  });

  it("snaps an unoffered duration to the closest, ties going down", () => {
    const cat = { ...catalog, durations: [{ publicId: "a", weeks: 1 }, { publicId: "b", weeks: 2 }, { publicId: "c", weeks: 4 }] };
    expect(renewSelections(cat, { ...src, durationWeeks: 3 }, start)!.durationWeeks).toBe(2);
    expect(renewSelections(cat, { ...src, durationWeeks: 7 }, start)!.durationWeeks).toBe(4);
  });
});

describe("renewPageMode", () => {
  it("is quick only with no quote params, no full flag and prior data", () => {
    expect(renewPageMode({ quoteParams: false, full: false, data: {} })).toBe("quick");
    expect(renewPageMode({ quoteParams: true, full: false, data: {} })).toBe("wizard");
    expect(renewPageMode({ quoteParams: false, full: true, data: {} })).toBe("wizard");
    expect(renewPageMode({ quoteParams: false, full: false, data: null })).toBe("wizard");
  });
});
