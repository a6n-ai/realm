// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ImageUploadField } from "../image-upload-field";

afterEach(cleanup);

describe("ImageUploadField", () => {
  it("shows a preview image when a value is set", () => {
    render(
      <ImageUploadField
        value={{
          name: "a.png",
          fileName: "a",
          type: "png",
          isDirectory: false,
          size: 3,
          filePath: "x/a.png",
          url: "/api/files/x/a.png",
        }}
        onChange={() => {}}
      />,
    );
    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toBe("/api/files/x/a.png");
  });

  it("renders an empty dropzone when value is null", () => {
    render(<ImageUploadField value={null} onChange={() => {}} />);
    expect(screen.queryByRole("img")).toBeNull();
  });
});
