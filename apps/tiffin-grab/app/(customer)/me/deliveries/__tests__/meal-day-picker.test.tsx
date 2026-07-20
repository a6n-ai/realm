// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("../meals/actions", () => ({
  pickMyDish: vi.fn().mockResolvedValue(undefined),
  applyMyDishToWeek: vi.fn().mockResolvedValue({ applied: 1 }),
}));

import { MealDayPicker } from "../meal-day-picker";
import type { CalendarCell } from "../calendar-constants";

const cell: CalendarCell = {
  date: "2026-07-21",
  status: "scheduled",
  locked: false,
  isMakeup: false,
  menuWeekId: "mw_1",
  meal: [
    {
      category: "sabzi",
      selectable: true,
      label: "Sabzi",
      quantity: 2,
      picks: [
        { dishId: 1n, dishPublicId: "dsh_1", name: "Aloo Gobi", isDefaulted: false },
        { dishId: 2n, dishPublicId: "dsh_2", name: "Paneer", isDefaulted: false },
      ],
    },
  ],
  options: [
    { category: "sabzi", dishId: "dsh_1", name: "Aloo Gobi", diet: "veg", image: null },
    { category: "sabzi", dishId: "dsh_2", name: "Paneer", diet: "veg", image: null },
  ],
};

describe("MealDayPicker multi-qty", () => {
  it("shows Item tabs when categoryCounts qty > 1", () => {
    render(
      <MealDayPicker
        cell={cell}
        orderPublicId="ord_1"
        categoryLabels={{ sabzi: "Sabzi" }}
        categoryCounts={{ sabzi: 2 }}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.getByRole("tab", { name: "Item 1" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Item 2" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Item 2" }));
    expect(screen.getByRole("tab", { name: "Item 2" })).toHaveAttribute("aria-selected", "true");
  });
});
