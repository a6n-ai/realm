// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FinanceStats, FinanceStatsSkeleton } from "../finance-stats";

afterEach(cleanup);

describe("FinanceStats", () => {
  it("renders one Spent/Saved line in the app currency", () => {
    render(
      <FinanceStats
        usage={{ tiffinsDelivered: 12, subscriptionCount: 3, plans: [], totalSpent: "142.50", totalSaved: "18.00" }}
        currency="CAD"
      />,
    );
    expect(screen.getByText("Spent $142.50 · Saved $18.00")).toBeInTheDocument();
    expect(screen.queryByText("Tiffins delivered")).toBeNull();
  });

  it("skeleton renders a single line", () => {
    const { container } = render(<FinanceStatsSkeleton />);
    expect(container.children).toHaveLength(1);
  });
});
