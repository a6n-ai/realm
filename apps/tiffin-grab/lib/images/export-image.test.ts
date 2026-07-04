import { describe, expect, it } from "vitest";
import { fitWithin } from "./export-image";

describe("fitWithin", () => {
  it("downscales the longest side to maxDim, preserving aspect", () => {
    expect(fitWithin(2000, 1000, 1600)).toEqual({ w: 1600, h: 800 });
  });
  it("leaves images already within bounds untouched", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ w: 800, h: 600 });
  });
  it("clamps a square to maxDim x maxDim", () => {
    expect(fitWithin(3000, 3000, 1600)).toEqual({ w: 1600, h: 1600 });
  });
  it("rounds fractional results", () => {
    expect(fitWithin(1000, 333, 500)).toEqual({ w: 500, h: 167 });
  });
});
