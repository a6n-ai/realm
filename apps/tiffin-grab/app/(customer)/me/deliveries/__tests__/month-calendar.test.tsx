// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MonthCalendar } from "../month-calendar";
import type { CalendarCell } from "../calendar-constants";

afterEach(cleanup);

function cell(date: string): CalendarCell {
  return {
    date,
    status: "scheduled",
    locked: false,
    isMakeup: false,
    menuWeekId: "mw_1",
    meal: null,
    options: [],
  };
}

describe("MonthCalendar — month navigation", () => {
  it("shows previous/next month controls", () => {
    const cellsByDate = new Map([
      ["2026-07-20", cell("2026-07-20")],
      ["2026-07-21", cell("2026-07-21")],
    ]);

    render(
      <MonthCalendar
        cellsByDate={cellsByDate}
        selected="2026-07-20"
        onSelect={vi.fn()}
        todayIso="2026-07-20"
        monthKey="2026-07"
        onMonthChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /Go to the Previous Month/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Go to the Next Month/i })).toBeInTheDocument();
  });

  it("navigates to the next month without changing selection", () => {
    const onSelect = vi.fn();
    const cellsByDate = new Map([
      ["2026-07-20", cell("2026-07-20")],
      ["2026-08-03", cell("2026-08-03")],
    ]);

    render(
      <MonthCalendar
        cellsByDate={cellsByDate}
        selected="2026-07-20"
        onSelect={onSelect}
        todayIso="2026-07-20"
        monthKey="2026-07"
        onMonthChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/July 2026/i);

    fireEvent.click(screen.getByRole("button", { name: /Go to the Next Month/i }));

    expect(screen.getByRole("status")).toHaveTextContent(/August 2026/i);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("requests the next month when navigating forward", () => {
    const onMonthChange = vi.fn();
    const cellsByDate = new Map([["2026-07-20", cell("2026-07-20")]]);

    render(
      <MonthCalendar
        cellsByDate={cellsByDate}
        selected="2026-07-20"
        onSelect={vi.fn()}
        todayIso="2026-07-20"
        monthKey="2026-07"
        onMonthChange={onMonthChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Go to the Next Month/i }));

    expect(onMonthChange).toHaveBeenCalledWith("2026-08");
  });

  it("disables previous before the start of today's month", () => {
    const cellsByDate = new Map([["2026-07-20", cell("2026-07-20")]]);

    const { container } = render(
      <MonthCalendar
        cellsByDate={cellsByDate}
        selected="2026-07-20"
        onSelect={vi.fn()}
        todayIso="2026-07-20"
        monthKey="2026-07"
        onMonthChange={vi.fn()}
      />,
    );

    const prev = container.querySelector('button[name="previous-month"]')
      ?? screen.getByRole("button", { name: /Go to the Previous Month/i });
    expect(prev).toHaveAttribute("aria-disabled", "true");
  });
});
