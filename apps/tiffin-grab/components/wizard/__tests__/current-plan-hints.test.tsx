// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StepBundle } from "../steps/step-bundle";
import { StepDuration } from "../steps/step-duration";
import { StepBaseline } from "../steps/step-baseline";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import type { WizardSelections } from "../selections";
import type { CurrentPlanSummary } from "../current-plan-hint";

afterEach(cleanup);

const currentPlan: CurrentPlanSummary = {
  planName: "Pure Vegetarian Plan",
  mealSizeName: "Maharaja Thali (Veg)",
  daysPerWeek: 5,
  status: "active",
  startDate: "2026-07-20",
};

const catalog: ClientCatalogSnapshot = {
  plans: [
    {
      publicId: "pln_veg",
      key: "veg",
      name: "Veg",
      description: "Veg plan",
      planType: "tiffin",
      offeredSlots: [],
      allowedStartDays: ["mon", "tue", "wed", "thu", "fri"],
    },
  ],
  mealSizes: [
    {
      publicId: "msz_small",
      key: "small_thali",
      name: "small_thali",
      description: null,
      planKey: "veg",
      tier: "budget",
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
  durations: [{ publicId: "dur_1", weeks: 1, discountPct: 0 }],
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
  startDate: "2026-07-22",
};

describe("wizard current-plan soft hints", () => {
  it("baseline shows current plan name", () => {
    render(
      <StepBaseline catalog={catalog} selections={selections} set={vi.fn()} currentPlan={currentPlan} />,
    );
    expect(screen.getByText(/Your current plan is/i)).toBeInTheDocument();
    expect(screen.getByText("Pure Vegetarian Plan")).toBeInTheDocument();
  });

  it("bundle shows meal size and days/wk for the current plan", () => {
    render(
      <StepBundle catalog={catalog} selections={selections} set={vi.fn()} currentPlan={currentPlan} />,
    );
    expect(screen.getByText(/Maharaja Thali \(Veg\)/i)).toBeInTheDocument();
    expect(screen.getByText(/5 days\/wk/i)).toBeInTheDocument();
    expect(screen.getByText(/Choose a meal size for the/i)).toBeInTheDocument();
  });

  it("duration shows same-week copy when conflict is set", () => {
    render(
      <StepDuration
        catalog={catalog}
        selections={selections}
        set={vi.fn()}
        result={null}
        sameWeekConflict
        currentPlan={currentPlan}
      />,
    );
    expect(screen.getByText(/already subscribed on your current plan/i)).toBeInTheDocument();
    expect(screen.getByText(/You can still continue/i)).toBeInTheDocument();
  });

  it("duration names the overlap bound when minStartDate is after tomorrow", () => {
    render(
      <StepDuration
        catalog={catalog}
        selections={selections}
        set={vi.fn()}
        result={null}
        currentPlan={currentPlan}
        minStartDate="2099-01-15"
      />,
    );
    expect(screen.getByText(/This renewal can start on or after/i)).toBeInTheDocument();
    expect(screen.getByText(/Jan 15/)).toBeInTheDocument();
    expect(document.querySelector('input[type="date"]')).toBeNull();
    // Custom date-picker trigger, not a native input — its accessible name
    // comes from the associated <label for> ("Start date"), per HTML
    // label-association rules for labelable elements (button included). The
    // fixture's selections.startDate ("2026-07-22") is already set, so the
    // button shows the formatted date rather than the empty-state "Pick a
    // date" placeholder — this assertion only needs to confirm the custom
    // picker button renders, which the input[type="date"] check above already
    // establishes isn't a native control.
    expect(screen.getByRole("button", { name: /start date/i })).toBeInTheDocument();
  });
});
