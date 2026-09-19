import { describe, expect, it } from "vitest";
import { initialSelections, nextBlockedReason, type WizardSelections } from "../selections";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";

const catalog = {
  frequencies: [{ publicId: "f1", key: "mwf", name: "mwf", daysPerWeek: 3, weekdays: ["mon", "wed", "fri"] }],
  minTiffinsPerWeek: 3,
  maxTiffinsPerWeek: 7,
} as unknown as ClientCatalogSnapshot;
const sel = (over: Partial<WizardSelections> = {}): WizardSelections => ({ ...initialSelections, ...over });

describe("nextBlockedReason", () => {
  it("baseline: asks for a plan until one is chosen", () => {
    expect(nextBlockedReason(0, catalog, sel({ planKey: null }))).toMatch(/baseline plan/i);
    expect(nextBlockedReason(0, catalog, sel({ planKey: "veg" }))).toBeNull();
  });

  it("bundle: asks for a meal size", () => {
    expect(nextBlockedReason(1, catalog, sel({ mealSizeId: "" }))).toMatch(/meal size/i);
    expect(nextBlockedReason(1, catalog, sel({ mealSizeId: "msz_1" }))).toBeNull();
  });

  it("schedule: explains what is missing or out of range", () => {
    expect(nextBlockedReason(2, catalog, sel({ frequencyKey: "" }))).toMatch(/delivery/i);
    expect(nextBlockedReason(2, catalog, sel({ frequencyKey: "mwf", eatingDays: ["mon"] }))).toMatch(/between 3 and 7/i);
    expect(nextBlockedReason(2, catalog, sel({ frequencyKey: "mwf", eatingDays: ["mon", "wed", "fri"] }))).toBeNull();
  });

  it("start & commitment: asks for a start date", () => {
    expect(nextBlockedReason(3, catalog, sel({ mealSizeId: "msz_1", startDate: "" }))).toMatch(/start date/i);
    expect(nextBlockedReason(3, catalog, sel({ mealSizeId: "msz_1", startDate: "2026-10-05" }))).toBeNull();
    expect(nextBlockedReason(3, catalog, sel({ mealSizeId: "", startDate: "2026-10-05" }))).toMatch(/meal size/i);
  });
});
