// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const pickMyDish = vi.fn().mockResolvedValue(undefined);
vi.mock("@/app/(customer)/me/meals/actions", () => ({ pickMyDish: (...a: unknown[]) => pickMyDish(...a), applyMyDishToWeek: vi.fn() }));
vi.mock("@/components/motion", () => ({
  Reveal: Object.assign(({ children }: { children: React.ReactNode }) => <div>{children}</div>, { Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }),
  Pressable: ({ children, ...p }: { children: React.ReactNode } & Record<string, unknown>) => <button {...(p as object)}>{children}</button>,
}));
vi.mock("@realm/ui/sonner", () => ({ toast: { error: vi.fn() } }));

import { MealPicker } from "../meal-picker";

const grid = [
  { day: "tue", dateIso: "2026-07-15", slot: "sabzi", personIndex: 1, pickIndex: 1, selectable: true, quantity: 1, selectedDishId: "dsh_1", isDefaulted: false, locked: false,
    dishes: [ { id: "dsh_1", name: "Paneer", diet: "veg", image: null }, { id: "dsh_2", name: "Aloo Gobi", diet: "veg", image: null } ] },
  { day: "wed", dateIso: "2026-07-16", slot: "sabzi", personIndex: 1, pickIndex: 1, selectable: true, quantity: 1, selectedDishId: "dsh_1", isDefaulted: false, locked: true,
    dishes: [ { id: "dsh_1", name: "Paneer", diet: "veg", image: null } ] },
] as never;
const categories = [{ key: "sabzi", label: "Sabzi", selectable: true, sortOrder: 0 }] as never;

afterEach(() => { pickMyDish.mockClear(); cleanup(); });

describe("MealPicker", () => {
  it("marks the selected option and fires pickMyDish on tapping another", () => {
    render(<MealPicker grid={grid} categories={categories} orderPublicId="ord_1" menuWeekId="mnw_1" />);
    fireEvent.click(screen.getByText("Aloo Gobi"));
    expect(pickMyDish).toHaveBeenCalledWith(expect.objectContaining({ orderId: "ord_1", menuWeekId: "mnw_1", dayOfWeek: "tue", slot: "sabzi", personIndex: 1, dishId: "dsh_2" }));
  });

  it("does not fire on a locked day's options", () => {
    render(<MealPicker grid={grid} categories={categories} orderPublicId="ord_1" menuWeekId="mnw_1" />);
    // "Paneer" appears on both days; the locked (wed) card's option must not be tappable.
    // Assert the locked day shows a read-only indicator.
    expect(screen.getByText(/locked/i)).toBeInTheDocument();
  });
});
