// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DishImage } from "../dish-image";

afterEach(cleanup);

describe("DishImage", () => {
  it("renders an img with the photo url + alt when image present", () => {
    render(<DishImage image={{ url: "/api/files/paneer.jpg", filePath: "p", fileName: "p", type: "image/jpeg", size: 1 } as never} name="Paneer" />);
    const img = screen.getByRole("img", { name: "Paneer" });
    expect(img).toHaveAttribute("src", "/api/files/paneer.jpg");
  });

  it("renders a gradient fallback (no img) when image is null", () => {
    render(<DishImage image={null} name="Dal Fry" />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Dal Fry", { exact: false })).toBeInTheDocument(); // fallback shows the name/glyph
  });
});
