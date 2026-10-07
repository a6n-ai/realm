// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { EndedPlan } from "@/lib/services/customer-deliveries.service";
import { NoPlan } from "../no-plan";

afterEach(cleanup);

const plan = (o: Partial<EndedPlan> = {}): EndedPlan => ({
  publicId: "ord_x", planName: "Veg", mealSizeName: "Maharaja Thali", status: "completed",
  corrected: false, total: 7, delivered: 7, deliveredDates: ["2026-10-05", "2026-10-06"], ...o,
});

describe("NoPlan", () => {
  it("shows an over plan with its last delivery and a renew link", () => {
    render(<NoPlan waitlisted={[]} ended={plan()} />);
    expect(screen.getByText("Your plan is over.")).toBeInTheDocument();
    expect(screen.getByText(/the last one on Tue, Oct 6/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Renew my plan" })).toHaveAttribute("href", "/me/renew");
    expect(screen.queryByText(/old website/)).not.toBeInTheDocument();
    expect(screen.queryByText("No plan running.")).not.toBeInTheDocument();
  });

  it("explains the old-site correction only on corrected plans", () => {
    render(<NoPlan waitlisted={[]} ended={plan({ corrected: true })} />);
    expect(screen.getByText(/moved over from our old website/)).toBeInTheDocument();
  });

  it("falls back to the start-a-plan card with no ended plan", () => {
    render(<NoPlan waitlisted={[]} ended={null} />);
    expect(screen.getByText("No plan running.")).toBeInTheDocument();
  });
});
