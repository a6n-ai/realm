// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PlanHeader } from "../plan-header";

afterEach(cleanup);

const sub = { displayStatus: "active", mealSizeName: "4 Item Thali", tagLabel: "Non-veg", planName: "Non-veg" } as unknown as Parameters<typeof PlanHeader>[0]["sub"];
const counts = { remaining: 3, total: 20 } as unknown as Parameters<typeof PlanHeader>[0]["counts"];

describe("PlanHeader renew", () => {
  it("offers Renew plan within a week of the last tiffin", () => {
    render(<PlanHeader sub={sub} counts={counts} renew={7} />);
    expect(screen.getByRole("link", { name: "Renew plan" })).toHaveAttribute("href", "/me/renew");
  });

  it("keeps it in the More drawer further out", () => {
    render(<PlanHeader sub={sub} counts={counts} renew={8} />);
    expect(screen.queryByRole("link", { name: "Renew plan" })).not.toBeInTheDocument();
  });
});

describe("PlanHeader in a line of renewals", () => {
  it("says it renewed instead of offering Renew", () => {
    render(<PlanHeader sub={sub} counts={counts} renew={3} renewal="Renewed · next plan starts Nov 2" />);
    expect(screen.queryByRole("link", { name: "Renew plan" })).not.toBeInTheDocument();
    expect(screen.getByTestId("plan-renewal")).toHaveTextContent("Renewed · next plan starts Nov 2");
  });
});
