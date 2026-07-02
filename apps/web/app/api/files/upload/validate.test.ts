import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, sanitizeFilename, validateUpload } from "./validate";

describe("validateUpload", () => {
  it("accepts a small png", () => {
    expect(validateUpload({ type: "image/png", size: 1000 })).toBeNull();
  });
  it("rejects a non-image type", () => {
    expect(validateUpload({ type: "application/pdf", size: 1000 })).toMatch(/image/i);
  });
  it("rejects an oversized image", () => {
    expect(validateUpload({ type: "image/jpeg", size: MAX_UPLOAD_BYTES + 1 })).toMatch(/5\s?MB|large/i);
  });
});

describe("sanitizeFilename", () => {
  it("lowercases and strips unsafe chars", () => {
    expect(sanitizeFilename("My Photo (v2)!.PNG")).toBe("my-photo-v2-.png");
  });
  it("falls back to 'file' for an empty result", () => {
    expect(sanitizeFilename("***")).toBe("file");
  });
});
