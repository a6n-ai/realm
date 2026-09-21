// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FinanceStats, FinanceStatsSkeleton } from "../finance-stats";

afterEach(cleanup);

describe("FinanceStats", () => {
  it("renders the four usage numbers, money in the app currency", () => {
    render(
      <FinanceStats
        usage={{ tiffinsDelivered: 12, subscriptionCount: 3, plans: [], totalSpent: "142.50", totalSaved: "18.00" }}
        currency="CAD"
      />,
    );
    expect(screen.getByText("Tiffins delivered")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Subscriptions")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("$142.50")).toBeInTheDocument();
    expect(screen.getByText("$18.00")).toBeInTheDocument();
  });

  it("skeleton reserves four tiles", () => {
    const { container } = render(<FinanceStatsSkeleton />);
    expect(container.querySelectorAll("div[aria-hidden] > div")).toHaveLength(4);
  });
});
