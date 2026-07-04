import { describe, expect, it } from "vitest";
import { sniffImageType } from "../validate";

describe("sniffImageType", () => {
  it("detects png / jpeg / webp by magic bytes", () => {
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe("image/png");
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    const webp = new Uint8Array(16);
    webp.set([0x52, 0x49, 0x46, 0x46], 0); webp.set([0x57, 0x45, 0x42, 0x50], 8); // RIFF…WEBP
    expect(sniffImageType(webp)).toBe("image/webp");
  });
  it("rejects non-images (e.g. a script) returning null", () => {
    expect(sniffImageType(new Uint8Array([0x3c, 0x3f, 0x70, 0x68, 0x70]))).toBeNull(); // <?php
  });
});
