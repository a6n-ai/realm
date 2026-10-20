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

  const wl = (pay: { publicId: string; expired: boolean } | null) => ({
    publicId: "ord_w", planName: "Veg", mealSizeName: "Large", daysPerWeek: 5, status: "pending" as const,
    fullName: "A", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6", pay,
  });

  it("links an unpaid, unexpired card order to its pay page", () => {
    render(<NoPlan waitlisted={[wl({ publicId: "pay_1", expired: false })]} ended={null} />);
    expect(screen.getByText("Waiting for payment")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pay by card" })).toHaveAttribute("href", "/me/pay/pay_1");
  });

  it("says an expired payment expired and offers no pay link", () => {
    render(<NoPlan waitlisted={[wl({ publicId: "pay_1", expired: true })]} ended={null} />);
    expect(screen.getByText("This payment expired.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Pay by card" })).not.toBeInTheDocument();
  });

  it("keeps the confirmation copy for orders without a card payment", () => {
    render(<NoPlan waitlisted={[wl(null)]} ended={null} />);
    expect(screen.getByText(/once your order is confirmed/)).toBeInTheDocument();
  });
});
