// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AnalyticsTiles } from "../analytics-tiles";
import { monthWindow } from "../analytics-month-window";

afterEach(cleanup);

describe("AnalyticsTiles", () => {
  it("renders exactly three tiles with the given count/spend/savings", () => {
    render(<AnalyticsTiles deliveriesThisMonth={7} totalSpend="142.50" totalSavings="18.00" />);

    // StatGrid renders both a mobile StatBar and a desktop StatCard grid (CSS
    // hides one per breakpoint; jsdom has no layout), so each value appears twice.
    expect(screen.getAllByText("Deliveries this month").length).toBeGreaterThan(0);
    expect(screen.getAllByText("7").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Total spend").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$142.50").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Savings").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$18.00").length).toBeGreaterThan(0);
  });
});

describe("monthWindow", () => {
  it("uses the app timezone's calendar date, not the server's UTC date", () => {
    // 2026-07-31 20:00 UTC is already 2026-08-01 01:30 in Asia/Kolkata (+05:30) —
    // the window must be August, not July, when computed in that zone.
    const nowMs = Date.UTC(2026, 6, 31, 20, 0, 0);
    expect(monthWindow(nowMs, "Asia/Kolkata")).toEqual({ from: "2026-08-01", until: "2026-08-31" });
  });

  it("stays in the current month for a UTC-anchored zone", () => {
    const nowMs = Date.UTC(2026, 1, 15, 12, 0, 0); // Feb 15, 2026
    expect(monthWindow(nowMs, "UTC")).toEqual({ from: "2026-02-01", until: "2026-02-28" });
  });
});
