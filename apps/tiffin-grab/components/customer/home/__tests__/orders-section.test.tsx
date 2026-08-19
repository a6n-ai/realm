// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OrdersSection } from "../orders-section";
import type { SubSummary } from "@/lib/services/customer-deliveries.service";

afterEach(cleanup);

function sub(overrides: Partial<SubSummary>): SubSummary {
  return {
    publicId: "ord_1",
    planName: "Weekly Veg",
    mealSizeName: "Regular",
    daysPerWeek: 5,
    status: "active",
    createdAt: Date.now(),
    startDate: "2026-07-01",
    ...overrides,
  };
}

describe("OrdersSection", () => {
  it("renders nothing when the customer only has a live plan", () => {
    const { container } = render(
      <OrdersSection subs={[sub({ status: "active" }), sub({ publicId: "ord_2", status: "paused" })]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there are no orders at all", () => {
    const { container } = render(<OrdersSection subs={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists completed and cancelled plans without repeating the live plan", () => {
    render(
      <OrdersSection
        subs={[
          sub({ status: "active" }),
          sub({ publicId: "ord_old", planName: "Daily Non-Veg", status: "completed", startDate: "2026-01-06" }),
          sub({ publicId: "ord_x", planName: "Cancelled Veg", status: "cancelled", startDate: "2026-03-02" }),
        ]}
      />,
    );
    expect(screen.getByRole("heading", { name: /Earlier plans/i })).toBeInTheDocument();
    expect(screen.getByText(/Daily Non-Veg/)).toBeInTheDocument();
    expect(screen.getByText(/Cancelled Veg/)).toBeInTheDocument();
    expect(screen.queryByText("Weekly Veg")).not.toBeInTheDocument();
  });
});
