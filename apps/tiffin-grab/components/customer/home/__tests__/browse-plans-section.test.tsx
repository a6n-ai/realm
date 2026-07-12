// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import { selectablePlans } from "@/components/wizard/plan-filter";
import { BrowsePlansSection, type PlanWithPrice } from "../browse-plans-section";

afterEach(cleanup);

function meal(key: string, planKey: string, basePrice: number, trial = false) {
  return {
    publicId: `msz_${key}`, key, name: key, planKey, tier: "budget" as const,
    components: [], items: [], kcalMin: 400, kcalMax: 600,
    proteinG: null, carbsG: null, fatG: null, basePrice, trial,
  };
}

function plan(key: string, name: string, planType: "tiffin" | "healthy") {
  return { publicId: `pln_${key}`, key, name, description: null, planType, offeredSlots: [], allowedStartDays: [] };
}

const catalog: ClientCatalogSnapshot = {
  plans: [plan("veg", "Weekly Veg", "tiffin"), plan("non-veg", "Weekly Non-Veg", "tiffin"), plan("healthy", "Healthy", "healthy")],
  mealSizes: [meal("small_thali", "veg", 12), meal("big_thali", "veg", 10), meal("nonveg_4", "non-veg", 15)],
  frequencies: [], durations: [], zones: [],
};

// Mirrors the server mapping in BrowsePlansSectionData.
function withPrice(cat: ClientCatalogSnapshot): PlanWithPrice[] {
  return selectablePlans(cat).map((p) => {
    const prices = cat.mealSizes.filter((m) => m.planKey === p.key && !m.trial).map((m) => m.basePrice);
    return { ...p, priceFrom: prices.length ? Math.min(...prices) : null };
  });
}

describe("BrowsePlansSection", () => {
  it("renders selectable plans linking to /subscribe, hides zero-size plans", () => {
    render(<BrowsePlansSection plans={withPrice(catalog)} />);
    expect(screen.getByText("Weekly Veg")).toBeInTheDocument();
    expect(screen.getByText("Weekly Non-Veg")).toBeInTheDocument();
    expect(screen.queryByText("Healthy")).not.toBeInTheDocument();

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toHaveAttribute("href", "/subscribe");
  });

  it("shows the minimum meal-size price as 'from $X'", () => {
    render(<BrowsePlansSection plans={withPrice(catalog)} />);
    expect(screen.getByText(/from \$10\.00/)).toBeInTheDocument(); // veg min of 12,10
    expect(screen.getByText(/from \$15\.00/)).toBeInTheDocument(); // non-veg
  });

  it("renders an EmptyState when there are no selectable plans", () => {
    render(<BrowsePlansSection plans={[]} />);
    expect(screen.getByText(/no plans/i)).toBeInTheDocument();
  });

  it("excludes trial meal sizes from the minimum price", () => {
    const catalogWithTrial: ClientCatalogSnapshot = {
      plans: [plan("veg", "Weekly Veg", "tiffin")],
      mealSizes: [meal("trial_taste", "veg", 3, true), meal("small_thali", "veg", 12), meal("big_thali", "veg", 10)],
      frequencies: [], durations: [], zones: [],
    };
    render(<BrowsePlansSection plans={withPrice(catalogWithTrial)} />);
    expect(screen.getByText(/from \$10\.00/)).toBeInTheDocument();
    expect(screen.queryByText(/from \$3\.00/)).not.toBeInTheDocument();
  });
});
