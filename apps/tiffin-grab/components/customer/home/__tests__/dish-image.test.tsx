// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DishImage } from "../dish-image";

afterEach(cleanup);

describe("DishImage", () => {
  it("routes the photo through the next/image optimizer, preserving the file url", () => {
    render(<DishImage image={{ url: "/api/files/paneer.jpg", filePath: "p", fileName: "p", type: "image/jpeg", size: 1 } as never} name="Paneer" />);
    const img = screen.getByRole("img", { name: "Paneer" });
    // next/image rewrites src to /_next/image?url=<encoded>&w=..&q=.. — assert the
    // optimizer is used AND that it wraps the real file url, not just that src changed.
    const src = img.getAttribute("src") ?? "";
    expect(src).toContain("/_next/image");
    expect(decodeURIComponent(src)).toContain("/api/files/paneer.jpg");
  });

  it("requests a srcset sized to the tile, not the viewport", () => {
    render(<DishImage image={{ url: "/api/files/paneer.jpg", filePath: "p", fileName: "p", type: "image/jpeg", size: 1 } as never} name="Paneer" sizes="56px" />);
    // Without an explicit sizes, fill assumes 100vw and pulls the largest candidate into
    // a 56px box — the bandwidth win is the whole point of using next/image here.
    expect(screen.getByRole("img", { name: "Paneer" })).toHaveAttribute("sizes", "56px");
  });

  it("renders a gradient fallback (no img) when image is null", () => {
    render(<DishImage image={null} name="Dal Fry" />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Dal Fry", { exact: false })).toBeInTheDocument(); // fallback shows the name/glyph
  });
});
