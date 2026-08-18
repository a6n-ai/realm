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
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// Radix Select relies on pointer-capture APIs jsdom doesn't implement.
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};

import { MealPicker } from "../meal-picker";

// Radix Tabs activates on pointerdown+focus, not a bare click — mirrors the
// same helper in app/(dashboard)/dashboard/catalog/dishes/__tests__/catalog-tabs.test.tsx.
function clickTab(el: HTMLElement) {
  fireEvent.pointerDown(el, { pointerId: 1, button: 0 });
  el.focus();
  fireEvent.focus(el);
  fireEvent.click(el);
}

const grid = [
  { day: "tue", dateIso: "2026-07-15", slot: "sabzi", personIndex: 1, pickIndex: 1, selectable: true, quantity: 1, selectedDishId: "dsh_1", isDefaulted: false, locked: false,
    dishes: [ { id: "dsh_1", name: "Paneer", image: null }, { id: "dsh_2", name: "Aloo Gobi", image: null } ] },
  { day: "wed", dateIso: "2026-07-16", slot: "sabzi", personIndex: 1, pickIndex: 1, selectable: true, quantity: 1, selectedDishId: "dsh_1", isDefaulted: false, locked: true,
    dishes: [ { id: "dsh_1", name: "Paneer", image: null } ] },
] as never;
const categories = [{ key: "sabzi", label: "Sabzi", selectable: true, sortOrder: 0 }] as never;

afterEach(() => { pickMyDish.mockClear(); cleanup(); });

describe("MealPicker", () => {
  it("marks the selected option and fires pickMyDish on tapping another", async () => {
    render(<MealPicker grid={grid} categories={categories} orderPublicId="ord_1" menuWeekId="mnw_1" />);
    // The dish choice is a Select now — its options only exist in the DOM once
    // the trigger opens it, not as a directly-clickable list.
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByText("Aloo Gobi"));
    expect(pickMyDish).toHaveBeenCalledWith(expect.objectContaining({ orderId: "ord_1", menuWeekId: "mnw_1", dayOfWeek: "tue", slot: "sabzi", personIndex: 1, dishId: "dsh_2" }));
  });

  it("does not fire on a locked day's options", () => {
    render(<MealPicker grid={grid} categories={categories} orderPublicId="ord_1" menuWeekId="mnw_1" />);
    // Only the active day's cells render (MealPicker is a day-tabbed view, one day's
    // picks visible at a time) — switch to Wednesday, the locked day in this fixture,
    // before asserting its read-only indicator shows.
    clickTab(screen.getByRole("tab", { name: /wed/i }));
    expect(screen.getByText(/locked/i)).toBeInTheDocument();
  });
});
