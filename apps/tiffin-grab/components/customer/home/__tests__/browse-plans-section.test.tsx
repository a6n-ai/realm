// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import { selectablePlans } from "@/components/wizard/plan-filter";
import { BrowsePlansSection } from "../browse-plans-section";

afterEach(cleanup);

function meal(key: string, planKey: string) {
  return {
    publicId: `msz_${key}`, key, name: key, planKey, tier: "budget" as const,
    components: [], items: [], kcalMin: 400, kcalMax: 600,
    proteinG: null, carbsG: null, fatG: null, basePrice: 10, trial: false,
  };
}

function plan(key: string, name: string, planType: "tiffin" | "healthy") {
  return { publicId: `pln_${key}`, key, name, description: null, planType, offeredSlots: [], allowedStartDays: [] };
}

// Healthy ships zero meal sizes — must stay hidden from the browse grid.
const catalog: ClientCatalogSnapshot = {
  plans: [plan("veg", "Weekly Veg", "tiffin"), plan("non-veg", "Weekly Non-Veg", "tiffin"), plan("healthy", "Healthy", "healthy")],
  mealSizes: [meal("small_thali", "veg"), meal("nonveg_4", "non-veg")],
  frequencies: [], durations: [], zones: [],
};

describe("BrowsePlansSection", () => {
  it("renders exactly the selectable plans, each linking to /subscribe, hiding zero-size plans", () => {
    const plans = selectablePlans(catalog);
    render(<BrowsePlansSection plans={plans} />);

    expect(screen.getByText("Weekly Veg")).toBeInTheDocument();
    expect(screen.getByText("Weekly Non-Veg")).toBeInTheDocument();
    expect(screen.queryByText("Healthy")).not.toBeInTheDocument();

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/subscribe");
    }
  });

  it("renders an EmptyState when there are no selectable plans", () => {
    render(<BrowsePlansSection plans={[]} />);
    expect(screen.getByText(/no plans/i)).toBeInTheDocument();
  });
});
