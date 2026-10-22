// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/motion", () => ({
  LottieEmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));

import { ThisWeekMenuSection } from "../this-week-menu-section";
import { buildWeekBoard } from "@/lib/landing/week-board";

const week = {
  weekStart: "2026-07-13",
  slots: [{ key: "sabzi", label: "Sabzi", selectable: true, sortOrder: 1, tuUnitType: "weight", tuUnitSize: "8", tuUnitLabel: "oz" }],
  items: [
    { dayOfWeek: "mon", slot: "sabzi", position: 0, dishName: "Paneer Butter Masala", image: null, dishPublicId: "dsh_1" },
    { dayOfWeek: "sat", slot: "sabzi", position: 0, dishName: "Weekend Biryani", image: null, dishPublicId: "dsh_2" },
  ],
} as unknown as Parameters<typeof buildWeekBoard>[0];

afterEach(cleanup);

describe("ThisWeekMenuSection", () => {
  it("renders the public week board with the week range", () => {
    render(<ThisWeekMenuSection weekStart={week.weekStart} board={buildWeekBoard(week, "America/Toronto")} />);
    expect(screen.getByText(/ to /)).toBeInTheDocument();
    expect(screen.getAllByText("Paneer Butter Masala").length).toBeGreaterThan(0);
    expect(screen.getByText("Weekend Biryani")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "This week's menu" })).toBeInTheDocument();
  });

  it("renders the empty state when no week is released", () => {
    render(<ThisWeekMenuSection weekStart={null} board={null} />);
    expect(screen.getByText(/No menu released yet/i)).toBeInTheDocument();
  });

  it("titles a next-week fallback", () => {
    render(<ThisWeekMenuSection weekStart={week.weekStart} board={buildWeekBoard(week, "America/Toronto")} scope="next" />);
    expect(screen.getByRole("heading", { name: "Next week's menu" })).toBeInTheDocument();
  });
});
