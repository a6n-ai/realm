/* eslint-disable */
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MenuBuilder } from "../menu-builder";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("../actions", () => ({
  setDaySide: vi.fn(async () => ({ ok: true })), setSideDefault: vi.fn(async () => ({ ok: true })),
  markReady: vi.fn(), backToDraft: vi.fn(), releaseWeek: vi.fn(), saveWeek: vi.fn(), amendImpact: vi.fn(), copyWeek: vi.fn(), createDish: vi.fn(),
}));

const sideSlot = {
  category: "sabzi", categoryLabel: "Sabzi", role: "side_1" as const,
  meals: ["5 Item Thali — Large (8oz)", "Maharaja Thali (8oz)"], defaultSource: "daal",
};
const slot = (categoryKey: string, label: string) => ({
  key: `${categoryKey}|p1`, categoryKey, categoryLabel: label, selectable: true, sortOrder: 1, planPublicId: "p1", planName: "Veg Plan",
});

const props = {
  mealType: { key: "tiffin", label: "Tiffin" } as any,
  slots: [slot("sabzi", "Sabzi"), slot("daal", "Dal")],
  plans: [{ publicId: "p1", name: "Veg Plan" }],
  categoryCounts: {},
  dishes: [
    { id: "d1", name: "Veg Korma", category: "sabzi", planId: "p1" },
    { id: "d2", name: "Masoor Dal", category: "daal", planId: "p1" },
    { id: "d3", name: "Aloo Matar", category: "sabzi", planId: "p1" },
  ],
  week: { id: "w", weekStart: "2026-09-21", status: "released", updatedAt: 1 },
  items: [
    { id: "i1", dayOfWeek: "mon", slot: "sabzi", dishId: "d1", position: 0, isDefault: true },
    { id: "i2", dayOfWeek: "mon", slot: "daal", dishId: "d2", position: 0, isDefault: true },
    { id: "i3", dayOfWeek: "tue", slot: "sabzi", dishId: "d3", position: 0, isDefault: true },
  ],
  copySources: [],
  problems: [],
};
const sides = (daySides: any[] = []) => ({ weekId: "w", slots: [sideSlot], categories: [{ key: "sabzi", label: "Sabzi" }, { key: "daal", label: "Dal" }], daySides });

afterEach(cleanup);

describe("side dishes in the menu maker", () => {
  it("adds a row per side under the grid showing what each day packs", () => {
    render(<MenuBuilder {...props} sides={sides()} />);
    expect(screen.getByText("Side dishes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Monday, Sabzi · Side 1: packs Masoor Dal$/ })).toBeInTheDocument();
    // Tuesday has no dal on the menu, so the side falls back to the sabzi.
    expect(screen.getByRole("button", { name: /^Tuesday, Sabzi · Side 1: packs No dal on the menu/ })).toBeInTheDocument();
  });

  it("opens the side in the panel with its meals and this day only; the standing default is separate", () => {
    render(<MenuBuilder {...props} sides={sides()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Monday, Sabzi · Side 1/ }));
    const panel = within(screen.getByTestId("side-panel"));
    expect(panel.getByText(/5 Item Thali — Large \(8oz\)/)).toBeInTheDocument();
    expect(panel.getByText("Masoor Dal")).toBeInTheDocument();
    expect(panel.getByRole("combobox", { name: "Monday source" })).toBeInTheDocument();
    expect(panel.queryByRole("combobox", { name: /default/i })).toBeNull();
    // The every-week default lives behind the Side dishes header's Defaults button.
    fireEvent.click(screen.getByRole("button", { name: "Defaults" }));
    expect(within(screen.getByRole("dialog")).getByRole("combobox", { name: "Sabzi · Side 1 default" })).toBeInTheDocument();
  });

  it("marks a day's dish override as changed", () => {
    render(<MenuBuilder {...props} sides={sides([{ day: "mon", category: "sabzi", role: "side_1", source: { kind: "dish", dishPublicId: "d1" } }])} />);
    expect(screen.getByRole("button", { name: /^Monday, Sabzi · Side 1: packs Veg Korma, changed for this day$/ })).toBeInTheDocument();
  });

  it("adds no side rows when no meal has a side", () => {
    render(<MenuBuilder {...props} sides={{ ...sides(), slots: [] }} />);
    expect(screen.queryByText("Side dishes")).toBeNull();
  });
});
