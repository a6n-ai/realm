import { describe, expect, it } from "vitest";
import { clampBox, exportRect, fitBox, imageToScreen, orientedSize, resizeBox, screenToImage } from "./crop-geometry";

describe("orientedSize", () => {
  it("keeps dims at 0/180, swaps at 90/270", () => {
    expect(orientedSize(400, 300, 0)).toEqual({ w: 400, h: 300 });
    expect(orientedSize(400, 300, 180)).toEqual({ w: 400, h: 300 });
    expect(orientedSize(400, 300, 90)).toEqual({ w: 300, h: 400 });
    expect(orientedSize(400, 300, 270)).toEqual({ w: 300, h: 400 });
  });
});

describe("fitBox", () => {
  it("returns the full area for free (null) aspect", () => {
    expect(fitBox(400, 300, null)).toEqual({ x: 0, y: 0, w: 400, h: 300 });
  });
  it("centers the largest 1:1 box (width-bound landscape)", () => {
    expect(fitBox(400, 300, 1)).toEqual({ x: 50, y: 0, w: 300, h: 300 });
  });
  it("centers a 16:9 box within a 4:3 area (width-bound)", () => {
    // w=400 -> h=225 <= 300 -> centered vertically
    expect(fitBox(400, 300, 16 / 9)).toEqual({ x: 0, y: 37.5, w: 400, h: 225 });
  });
});

describe("clampBox", () => {
  it("shrinks an over-large box then shifts inside bounds", () => {
    expect(clampBox({ x: -10, y: -10, w: 500, h: 500 }, { w: 400, h: 300 })).toEqual({ x: 0, y: 0, w: 400, h: 300 });
  });
  it("shifts a box that overflows the right/bottom edges", () => {
    expect(clampBox({ x: 350, y: 250, w: 100, h: 100 }, { w: 400, h: 300 })).toEqual({ x: 300, y: 200, w: 100, h: 100 });
  });
});

describe("screenToImage / imageToScreen", () => {
  const view = { zoom: 2, panX: 10, panY: 20 };
  const origin = { x: 5, y: 5 };
  it("round-trips a point", () => {
    const img = screenToImage({ x: 105, y: 105 }, view, origin);
    expect(img).toEqual({ x: (105 - 5 - 10) / 2, y: (105 - 5 - 20) / 2 });
    const back = imageToScreen(img, view, origin);
    expect(back.x).toBeCloseTo(105);
    expect(back.y).toBeCloseTo(105);
  });
});

describe("exportRect", () => {
  it("rounds and clamps to bounds", () => {
    expect(exportRect({ x: 10.4, y: 20.6, w: 100.2, h: 50.9 }, { w: 200, h: 60 })).toEqual({ x: 10, y: 21, w: 100, h: 39 });
  });
});

describe("resizeBox", () => {
  const bounds = { w: 400, h: 300 };
  const box = { x: 100, y: 100, w: 100, h: 100 };
  it("free SE corner grows width+height by the delta", () => {
    expect(resizeBox(box, "se", 20, 40, { aspect: null, minSize: 10, bounds })).toEqual({ x: 100, y: 100, w: 120, h: 140 });
  });
  it("free E edge grows only width", () => {
    expect(resizeBox(box, "e", 30, 0, { aspect: null, minSize: 10, bounds })).toEqual({ x: 100, y: 100, w: 130, h: 100 });
  });
  it("free NW corner moves the top-left, opposite corner fixed", () => {
    // right=200, bottom=200 fixed; left=100-20=80, top=100-20=80
    expect(resizeBox(box, "nw", -20, -20, { aspect: null, minSize: 10, bounds })).toEqual({ x: 80, y: 80, w: 120, h: 120 });
  });
  it("aspect 1:1 SE corner keeps width==height (width drives)", () => {
    const r = resizeBox(box, "se", 40, 10, { aspect: 1, minSize: 10, bounds });
    expect(r.w).toBe(r.h);
    expect(r).toEqual({ x: 100, y: 100, w: 140, h: 140 });
  });
  it("enforces minSize on shrink", () => {
    const r = resizeBox(box, "se", -200, -200, { aspect: null, minSize: 10, bounds });
    expect(r).toEqual({ x: 100, y: 100, w: 10, h: 10 });
  });
  it("clamps growth to bounds", () => {
    const r = resizeBox({ x: 350, y: 250, w: 40, h: 40 }, "se", 100, 100, { aspect: null, minSize: 10, bounds });
    expect(r).toEqual({ x: 350, y: 250, w: 50, h: 50 });
  });
});
