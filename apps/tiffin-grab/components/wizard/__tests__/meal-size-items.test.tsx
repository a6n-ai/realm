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
});
