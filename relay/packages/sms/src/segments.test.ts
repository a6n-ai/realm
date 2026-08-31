import { describe, expect, it } from "vitest";
import { countSegments } from "./segments";

describe("countSegments", () => {
  it("counts a short GSM-7 message as one segment", () => {
    expect(countSegments("Your order is ready")).toEqual({ segments: 1, encoding: "GSM-7" });
  });

  it("counts exactly 160 GSM-7 characters as one segment", () => {
    expect(countSegments("a".repeat(160)).segments).toBe(1);
  });

  it("counts 161 GSM-7 characters as two segments", () => {
    expect(countSegments("a".repeat(161)).segments).toBe(2);
  });

  it("switches to UCS-2 when a non-GSM character appears", () => {
    expect(countSegments("Ready 🎉").encoding).toBe("UCS-2");
  });

  it("counts 70 UCS-2 characters as one segment and 71 as two", () => {
    expect(countSegments("中".repeat(70)).segments).toBe(1);
    expect(countSegments("中".repeat(71)).segments).toBe(2);
  });

  it("charges GSM-7 extended characters as two septets each", () => {
    // {} [] ~ ^ \ | € occupy two septets each.
    expect(countSegments("{".repeat(80)).segments).toBe(1);
    expect(countSegments("{".repeat(81)).segments).toBe(2);
  });

  it("counts an empty message as one segment", () => {
    expect(countSegments("").segments).toBe(1);
  });
});
