// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MealInfoChips, PlanHeadingRow } from "../plan-box";

afterEach(cleanup);

describe("MealInfoChips", () => {
  it("shows human portions on chips and never TU", () => {
    render(
      <MealInfoChips
        categoryCounts={{ sabzi: 1, roti: 4 }}
        categoryLabels={{ sabzi: "Sabzi", roti: "Roti" }}
        categoryPortions={{ sabzi: "12oz", roti: "1 roti" }}
      />,
    );
    expect(screen.getByText("1× Sabzi · 12oz")).toBeInTheDocument();
    expect(screen.getByText("4× Roti · 1 roti")).toBeInTheDocument();
    expect(screen.queryByText(/\bTU\b/)).not.toBeInTheDocument();
  });
});

describe("PlanHeadingRow", () => {
  it("puts the diet pill beside the name and Active on the right", () => {
    render(
      <PlanHeadingRow
        name={<h2>Regular</h2>}
        dietLabel="Weekly Veg"
        color="#1FAE54"
        status="active"
        trailing={<span>14 days to renew</span>}
      />,
    );
    const name = screen.getByRole("heading", { name: "Regular" });
    expect(name.parentElement).toContainElement(screen.getByText("Weekly Veg"));
    expect(name.parentElement).not.toContainElement(screen.getByText("Active"));
    expect(screen.getByText("14 days to renew")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });
});
