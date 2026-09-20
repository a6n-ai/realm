// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";


vi.mock("../dish-modal", () => ({ DishModal: () => null }));

import { HomeMenuWeek } from "../home-menu-week";

afterEach(cleanup);

const week = {
  weekStart: "2026-09-14",
  slots: [{ key: "sabzi", label: "Sabzi", selectable: true, sortOrder: 1 }],
  items: [{ dayOfWeek: "mon", slot: "sabzi", position: 0, dishName: "Aloo Gobi", image: null, dishPublicId: "d1" }],
} as never;

describe("HomeMenuWeek", () => {
  it("renders all seven days, with empty days label-only", () => {
    render(<HomeMenuWeek week={week} todayKey="tue" />);
    for (const d of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]) expect(screen.getByText(d, { exact: false })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByText("Today")).toBeInTheDocument();
  });
  it("shows an empty state without a week", () => {
    render(<HomeMenuWeek week={null} />);
    expect(screen.getByText(/no menu released yet/i)).toBeInTheDocument();
  });
});
