// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SwapPicker, effectiveCounts } from "../swap-picker";
import type { ClientMealSizeView } from "@/lib/catalog/types";

afterEach(cleanup);

const mealSize = {
  publicId: "msz_1", key: "m", name: "Medium", planKey: "veg", tier: "medium", components: [],
  items: [
    { name: "Sabzi", category: "sabzi", qty: 2, weightValue: 8, weightUnit: "oz" as const },
    { name: "Roti", category: "roti", qty: 4, weightValue: 1, weightUnit: "piece" as const },
  ],
  swapRules: [
    { publicId: "csr_1", fromCategory: "roti", toCategory: "rice", qtyFrom: 2, qtyTo: 1, toWeightValue: 250, toWeightUnit: "g" as const },
    { publicId: "csr_2", fromCategory: "sabzi", toCategory: "dal", qtyFrom: 5, qtyTo: 1, toWeightValue: null, toWeightUnit: null },
  ],
  kcalMin: 500, kcalMax: 700, proteinG: null, carbsG: null, fatG: null, basePrice: 10, trial: false,
} as unknown as ClientMealSizeView;

describe("effectiveCounts", () => {
  it("folds chosen swaps onto the composition", () => {
    expect(effectiveCounts(mealSize.items, mealSize.swapRules, [])).toEqual({ sabzi: 2, roti: 4 });
    expect(effectiveCounts(mealSize.items, mealSize.swapRules, ["csr_1"])).toEqual({ sabzi: 2, roti: 2, rice: 1 });
  });
});

describe("SwapPicker", () => {
  it("toggles a rule on and off", () => {
    const onChange = vi.fn();
    render(<SwapPicker mealSize={mealSize} chosenIds={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /2 roti/i }));
    expect(onChange).toHaveBeenCalledWith(["csr_1"]);
  });

  it("disables a swap the composition cannot afford", () => {
    render(<SwapPicker mealSize={mealSize} chosenIds={[]} onChange={() => {}} />);
    // csr_2 wants 5 sabzi and there are only 2.
    expect(screen.getByRole("button", { name: /5 sabzi/i })).toBeDisabled();
  });

  it("renders nothing when the meal size has no rules", () => {
    const { container } = render(
      <SwapPicker mealSize={{ ...mealSize, swapRules: [] }} chosenIds={[]} onChange={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
