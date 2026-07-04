// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ImageUploader } from "../image-uploader";

afterEach(cleanup);

const detail = {
  name: "a.webp",
  fileName: "a",
  type: "webp",
  isDirectory: false,
  size: 3,
  filePath: "x/a.webp",
  url: "/api/files/x/a.webp",
};

describe("ImageUploader", () => {
  it("shows a preview image when a value is set", () => {
    render(<ImageUploader value={detail} onChange={() => {}} />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "/api/files/x/a.webp");
  });

  it("renders a round preview when shape=round", () => {
    render(<ImageUploader value={detail} onChange={() => {}} shape="round" />);
    expect(screen.getByRole("img").className).toContain("rounded-full");
  });

  it("renders the dropzone (no image) when value is null", () => {
    render(<ImageUploader value={null} onChange={() => {}} />);
    expect(screen.queryByRole("img")).toBeNull();
  });
});
