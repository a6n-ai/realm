// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PlanSummary } from "../plan-summary";

afterEach(cleanup);

describe("PlanSummary", () => {
  it("shows meal, plan, delivery, eating-day pills, quantity line and start date", () => {
    render(
      <PlanSummary baseline="Pure Vegetarian Plan" mealName="4 Item Thali — Regular" deliveryName="5 days" eatingDays={["mon", "wed"]} weeks={2} startDate="2026-09-21" tiffinCount={4} />,
    );
    expect(screen.getByText("4 Item Thali — Regular")).toBeTruthy();
    expect(screen.getByText("Pure Vegetarian Plan")).toBeTruthy();
    expect(screen.getByText("2 tiffins a week × 2 weeks = 4 tiffins")).toBeTruthy();
    expect(screen.getByLabelText("Eating days").textContent).toBe("MonWed");
    expect(screen.getByText(/Starts Sep 21/)).toBeTruthy();
  });

  it("singularises and omits the start date until chosen", () => {
    render(<PlanSummary mealName="Small Thali" eatingDays={["mon"]} weeks={1} tiffinCount={1} />);
    expect(screen.getByText("1 tiffin a week × 1 week = 1 tiffin")).toBeTruthy();
    expect(screen.queryByText(/Starts/)).toBeNull();
  });
});
