// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DishModal } from "../dish-modal";

const dish = { name: "Paneer Butter Masala", description: "Creamy tomato gravy", diet: "veg" as const, image: { name: "p.jpg", url: "/api/files/p.jpg", filePath: "p", fileName: "p", type: "image/jpeg", isDirectory: false, size: 1 } };

afterEach(cleanup);

describe("DishModal", () => {
  it("shows name, description, and days-on-menu when open", () => {
    render(<DishModal dish={dish} daysOnMenu={["Mon", "Thu"]} open onOpenChange={() => {}} />);
    expect(screen.getByText("Paneer Butter Masala")).toBeInTheDocument();
    expect(screen.getByText(/Creamy tomato gravy/)).toBeInTheDocument();
    expect(screen.getByText(/Mon/)).toBeInTheDocument();
    expect(screen.getByText(/Thu/)).toBeInTheDocument();
  });
});
