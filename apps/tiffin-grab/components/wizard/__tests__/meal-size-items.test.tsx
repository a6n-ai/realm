// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MealSizeItems } from "../meal-size-items";

describe("MealSizeItems", () => {
  it("renders one chip per item: qty x category, with size suffix only when a weight exists", () => {
    render(
      <MealSizeItems
        items={[
          { name: "Roti", category: "Bread", qty: 3, weightValue: null, weightUnit: "piece" },
          { name: "Aloo Sabzi", category: "Sabzi", qty: 1, weightValue: 200, weightUnit: "g" },
        ]}
      />,
    );
    expect(screen.getByText("3× Bread")).toBeDefined();
    expect(screen.getByText("1× Sabzi · 200g")).toBeDefined();
  });

  it("renders nothing for an empty item list", () => {
    const { container } = render(<MealSizeItems items={[]} />);
    expect(container.querySelectorAll("span").length).toBe(0);
  });

  const items = [
    { name: "Roti", category: "roti", qty: 4, weightValue: 1, weightUnit: "piece" as const },
    { name: "Sabzi", category: "sabzi", qty: 2, weightValue: 8, weightUnit: "oz" as const },
  ];

  it("uses categoryLabels and the surviving catalog portion for the active (counts) card", () => {
    render(
      <MealSizeItems
        items={items}
        counts={{ roti: 2, sabzi: 2, rice: 1 }}
        swapRules={[
          { publicId: "csr_1", fromCategory: "roti", toCategory: "rice", qtyFrom: 2, qtyTo: 1, toWeightValue: 250, toWeightUnit: "g" },
        ]}
        categoryLabels={{ roti: "Roti", sabzi: "Sabzi", rice: "Rice" }}
      />,
    );
    // Reduced category keeps its own catalog portion convention (no suffix for "piece").
    expect(screen.getByText("2× Roti")).toBeDefined();
    expect(screen.getByText("2× Sabzi · 8oz")).toBeDefined();
    // Category with no catalog line falls back to the swap rule's own portion.
    expect(screen.getByText("1× Rice · 250g")).toBeDefined();
  });

  it("falls back to the raw category key when no categoryLabels are given", () => {
    render(<MealSizeItems items={items} counts={{ roti: 4 }} />);
    expect(screen.getByText("4× roti")).toBeDefined();
  });
});
