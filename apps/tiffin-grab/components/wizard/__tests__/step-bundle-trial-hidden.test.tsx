// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StepBundle } from "../steps/step-bundle";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import type { WizardSelections } from "../selections";

function meal(key: string, opts: { trial?: boolean } = {}) {
  return {
    publicId: `msz_${key}`,
    key,
    name: key,
    planKey: "veg",
    tier: "budget" as const,
    components: [],
    items: [],
    kcalMin: 400,
    kcalMax: 600,
    proteinG: null,
    carbsG: null,
    fatG: null,
    basePrice: 10,
    trial: opts.trial ?? false,
  };
}

const catalog: ClientCatalogSnapshot = {
  plans: [{ publicId: "pln_veg", key: "veg", name: "Veg", description: null, planType: "tiffin", offeredSlots: [], allowedStartDays: [] }],
  mealSizes: [meal("small_thali"), meal("trial_thali", { trial: true })],
  frequencies: [],
  durations: [],
  zones: [],
};

const selections: WizardSelections = {
  planKey: "veg",
  mealSizeId: "",
  frequencyKey: "5_day",
  persons: 1,
  mealSlots: [],
  includeSaturday: false,
  includeSunday: false,
  durationWeeks: 1,
  startDate: "",
};

describe("StepBundle trial hiding", () => {
  it("offers only the non-trial size and hides the trial size", () => {
    render(<StepBundle catalog={catalog} selections={selections} set={vi.fn()} />);
    expect(screen.getByText("small_thali")).toBeDefined();
    expect(screen.queryByText("trial_thali")).toBeNull();
  });
});
