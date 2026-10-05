/* eslint-disable */
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SideDishesCard } from "../side-dishes-card";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../actions", () => ({ setDaySide: vi.fn(), setSideDefault: vi.fn() }));

const slot = {
  category: "sabzi", categoryLabel: "Sabzi", role: "side_1" as const,
  meals: ["5 Item Thali — Large (8oz)", "Maharaja Thali (8oz)"], defaultSource: "daal",
};
const categories = [{ key: "sabzi", label: "Sabzi" }, { key: "daal", label: "Dal" }];
const dayDishes = {
  mon: [
    { publicId: "d1", name: "Veg Korma", category: "sabzi", isDefault: true },
    { publicId: "d2", name: "Masoor Dal", category: "daal", isDefault: true },
  ],
  tue: [{ publicId: "d3", name: "Aloo Matar", category: "sabzi", isDefault: true }],
};

afterEach(cleanup);

describe("SideDishesCard", () => {
  it("shows the side's meals and what each day packs from the default", () => {
    render(<SideDishesCard weekId="w" slots={[slot]} categories={categories} days={["mon", "tue"]} dayDishes={dayDishes} daySides={[]} />);
    expect(screen.getByText("Sabzi · Side 1")).toBeInTheDocument();
    expect(screen.getByText(/5 Item Thali — Large \(8oz\)/)).toBeInTheDocument();
    expect(screen.getByText("→ Masoor Dal")).toBeInTheDocument();
    // Tuesday has no dal on the menu, so the side falls back to the sabzi.
    expect(screen.getByText(/No dal on the menu/)).toBeInTheDocument();
  });

  it("shows a day's dish override", () => {
    render(<SideDishesCard weekId="w" slots={[slot]} categories={categories} days={["mon"]} dayDishes={dayDishes}
      daySides={[{ day: "mon", category: "sabzi", role: "side_1", source: { kind: "dish", dishPublicId: "d1" } }]} />);
    expect(screen.getByText("→ Veg Korma")).toBeInTheDocument();
  });

  it("renders nothing when no meal has a side", () => {
    const { container } = render(<SideDishesCard weekId="w" slots={[]} categories={categories} days={["mon"]} dayDishes={dayDishes} daySides={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
