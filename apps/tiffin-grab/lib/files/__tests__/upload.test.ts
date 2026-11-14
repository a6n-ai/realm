import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES, readImageUpload, sanitizeFilename } from "../upload";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0];

describe("readImageUpload", () => {
  it("accepts bytes that are an image", async () => {
    const r = await readImageUpload(new File([new Uint8Array(PNG)], "a.png", { type: "image/png" }));
    expect(r).toMatchObject({ type: "image/png" });
  });
  it("rejects a PDF renamed to .png even when File.type says image/png", async () => {
    const r = await readImageUpload(new File(["%PDF-1.7"], "a.png", { type: "image/png" }));
    expect(r).toEqual({ error: expect.stringMatching(/image/i) });
  });
  it("rejects files over the size cap", async () => {
    const big = { size: MAX_IMAGE_BYTES + 1 } as File;
    expect(await readImageUpload(big)).toEqual({ error: expect.stringMatching(/5\s?MB/) });
  });
});

describe("sanitizeFilename", () => {
  it("lowercases and collapses unsafe runs", () => {
    expect(sanitizeFilename("My Photo (v2)!.PNG")).toBe("my-photo-v2-.png");
  });
  it("never returns empty or a dot name", () => {
    expect(sanitizeFilename("***")).toBe("file");
    expect(sanitizeFilename("..")).toBe("file");
    expect(sanitizeFilename(".")).toBe("file");
  });
  it("cannot traverse directories", () => {
    expect(sanitizeFilename("../../etc/passwd")).not.toContain("/");
  });
});
