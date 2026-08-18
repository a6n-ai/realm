// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MealSizeItems } from "../meal-size-items";

describe("MealSizeItems", () => {
  it("groups rows by category into one chip: count x category, with portion suffix only when one exists", () => {
    render(
      <MealSizeItems
        items={[
          { name: "Roti", category: "Bread", tuAmount: 0.25, maxTuAmount: null, portion: null },
          { name: "Roti", category: "Bread", tuAmount: 0.25, maxTuAmount: null, portion: null },
          { name: "Roti", category: "Bread", tuAmount: 0.25, maxTuAmount: null, portion: null },
          { name: "Aloo Sabzi", category: "Sabzi", tuAmount: 1.5, maxTuAmount: null, portion: "12oz" },
        ]}
      />,
    );
    expect(screen.getByText("3× Bread")).toBeDefined();
    expect(screen.getByText("1× Sabzi · 12oz")).toBeDefined();
  });

  it("renders nothing for an empty item list", () => {
    const { container } = render(<MealSizeItems items={[]} />);
    expect(container.querySelectorAll("span").length).toBe(0);
  });

  it("uses categoryLabels to translate the category key", () => {
    render(
      <MealSizeItems
        items={[
          { name: "Roti", category: "roti", tuAmount: 0.25, maxTuAmount: null, portion: null },
          { name: "Roti", category: "roti", tuAmount: 0.25, maxTuAmount: null, portion: null },
          { name: "Sabzi", category: "sabzi", tuAmount: 1, maxTuAmount: null, portion: "8oz" },
        ]}
        categoryLabels={{ roti: "Roti", sabzi: "Sabzi" }}
      />,
    );
    expect(screen.getByText("2× Roti")).toBeDefined();
    expect(screen.getByText("1× Sabzi · 8oz")).toBeDefined();
  });

  it("falls back to the raw category key when no categoryLabels are given", () => {
    render(
      <MealSizeItems
        items={[
          { name: "Roti", category: "roti", tuAmount: 0.25, maxTuAmount: null, portion: null },
          { name: "Roti", category: "roti", tuAmount: 0.25, maxTuAmount: null, portion: null },
          { name: "Roti", category: "roti", tuAmount: 0.25, maxTuAmount: null, portion: null },
          { name: "Roti", category: "roti", tuAmount: 0.25, maxTuAmount: null, portion: null },
        ]}
      />,
    );
    expect(screen.getByText("4× roti")).toBeDefined();
  });
});
