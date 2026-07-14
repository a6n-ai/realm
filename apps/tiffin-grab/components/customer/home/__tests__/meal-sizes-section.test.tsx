// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("motion/react", () => ({ useReducedMotion: () => true }));
vi.mock("@/components/motion", () => ({
  Reveal: Object.assign(({ children }: { children: React.ReactNode }) => <div>{children}</div>, { Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }),
}));

import { MealSizesSection } from "../meal-sizes-section";

const mealSizes = [{ publicId: "ms_1", name: "Medium", planKey: "veg-tiffin", tier: "medium", components: ["Sabzi", "Dal", "Rice"], items: [], kcalMin: 600, kcalMax: 700, proteinG: 32, carbsG: null, fatG: null, basePrice: 8.5, trial: false }] as never;
const dishPool = [{ publicId: "dsh_1", name: "Paneer", description: null, diet: "veg", image: { url: "/api/files/p.jpg", filePath: "p", fileName: "p", type: "image/jpeg", size: 1 }, category: "sabzi" }] as never;

afterEach(cleanup);

describe("MealSizesSection", () => {
  it("renders tier, components, macros, price", () => {
    render(<MealSizesSection mealSizes={mealSizes} dishPool={dishPool} />);
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText(/Sabzi/)).toBeInTheDocument();
    expect(screen.getByText(/32/)).toBeInTheDocument();     // protein
    expect(screen.getByText(/8\.50/)).toBeInTheDocument();  // price
  });
});
