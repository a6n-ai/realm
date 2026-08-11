import { describe, expect, it } from "vitest";
import {
  DISMISS_VELOCITY,
  dragOffset,
  projectEndpoint,
  rubberband,
  shouldDismiss,
} from "../drag-dismiss";

const SHEET = 600;

describe("dragOffset", () => {
  it("tracks 1:1 in the dismiss direction", () => {
    expect(dragOffset(120, SHEET)).toBe(120);
  });

  it("damps against the dismiss direction instead of stopping dead", () => {
    const offset = dragOffset(-200, SHEET);
    expect(offset).toBeLessThan(0);
    // Followed, but by much less than the finger moved.
    expect(Math.abs(offset)).toBeLessThan(200);
    expect(Math.abs(offset)).toBeGreaterThan(0);
  });

  it("resists progressively — twice the overshoot moves less than twice as far", () => {
    const near = Math.abs(dragOffset(-100, SHEET));
    const far = Math.abs(dragOffset(-200, SHEET));
    expect(far).toBeGreaterThan(near);
    expect(far).toBeLessThan(near * 2);
  });
});

describe("rubberband", () => {
  it("is zero at the boundary and for a zero-sized surface", () => {
    expect(rubberband(0, SHEET)).toBe(0);
    expect(rubberband(100, 0)).toBe(0);
  });
});

describe("projectEndpoint", () => {
  it("throws further the faster the release", () => {
    const slow = projectEndpoint(50, 0.05);
    const fast = projectEndpoint(50, 0.4);
    expect(fast).toBeGreaterThan(slow);
    expect(slow).toBeGreaterThan(50);
  });

  it("lands where it started when the finger stopped before lifting", () => {
    expect(projectEndpoint(50, 0)).toBe(50);
  });
});

describe("shouldDismiss", () => {
  it("ignores a drag in the wrong direction", () => {
    expect(shouldDismiss(-300, -0.5, SHEET)).toBe(false);
  });

  it("keeps a short slow drag — this was a nudge, not a dismiss", () => {
    expect(shouldDismiss(40, 0.01, SHEET)).toBe(false);
  });

  it("dismisses a short flick, so a quick swipe is enough", () => {
    expect(shouldDismiss(40, DISMISS_VELOCITY, SHEET)).toBe(true);
  });

  it("dismisses a slow drag that still cleared half the surface", () => {
    expect(shouldDismiss(SHEET * 0.6, 0, SHEET)).toBe(true);
  });

  it("dismisses a mid drag whose momentum projects past half", () => {
    // 260px in, released at 0.1px/ms — under the flick threshold and short of
    // half the sheet, but the momentum carries the landing past 300.
    expect(shouldDismiss(260, 0.1, SHEET)).toBe(true);
    // Same distance, finger stopped before lifting: it stays put.
    expect(shouldDismiss(260, 0, SHEET)).toBe(false);
  });
});
