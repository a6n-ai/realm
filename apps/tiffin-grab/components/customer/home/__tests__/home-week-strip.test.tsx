// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("@/components/motion", () => ({
  Reveal: Object.assign(({ children }: { children: ReactNode }) => <div>{children}</div>, {
    Group: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  }),
  TransitionLink: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("@/app/(customer)/me/deliveries/week-rail", () => ({
  WeekRail: () => <div data-testid="week-rail" />,
}));

vi.mock("@/app/(customer)/me/deliveries/selected-day-summary", () => ({
  SelectedDaySummary: () => <div data-testid="day-summary" />,
}));

import { HomeWeekStrip, HomeWeekStripEmpty } from "../home-week-strip";
import type { CalendarCell } from "@/app/(customer)/me/deliveries/calendar-constants";

afterEach(cleanup);

describe("HomeWeekStrip", () => {
  it("renders legend and full calendar link when cells exist", () => {
    const cells: CalendarCell[] = [
      {
        date: "2026-07-20",
        status: "scheduled",
        locked: false,
        isMakeup: false,
        meal: null,
        options: [],
        menuWeekId: null,
      },
    ];
    render(<HomeWeekStrip cells={cells} todayIso="2026-07-19" />);
    expect(screen.getByTestId("week-rail")).toBeInTheDocument();
    expect(screen.getByText("Delivered")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Full calendar/i })).toHaveAttribute("href", "/me/deliveries");
  });

  it("empty state links to subscribe", () => {
    render(<HomeWeekStripEmpty />);
    expect(screen.getByText(/No deliveries scheduled yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Browse plans/i })).toHaveAttribute("href", "/subscribe");
  });
});
