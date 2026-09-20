// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NextTripCard } from "../next-trip-card";

afterEach(cleanup);

describe("NextTripCard", () => {
  it("shows covers line for a multi-day trip", () => {
    render(<NextTripCard deliveryDate="2026-09-21" coveredDates={["2026-09-21", "2026-09-22"]} today="2026-09-20" tiffinsLeft={18} />);
    expect(screen.getByText("Covers Mon + Tue")).toBeInTheDocument();
    expect(screen.getByText("18 tiffins left")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /pick meals/i })).toHaveAttribute("href", "/me/meals");
  });
  it("omits covers for a single-day trip and flags today", () => {
    render(<NextTripCard deliveryDate="2026-09-21" coveredDates={["2026-09-21"]} today="2026-09-21" />);
    expect(screen.queryByText(/covers/i)).toBeNull();
    expect(screen.getByText("Arriving today")).toBeInTheDocument();
  });
  it("empty state links to plans", () => {
    render(<NextTripCard deliveryDate={null} coveredDates={[]} today="2026-09-21" />);
    expect(screen.getByRole("link", { name: /browse plans/i })).toHaveAttribute("href", "/subscribe");
  });
});
