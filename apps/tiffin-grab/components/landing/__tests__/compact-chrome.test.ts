import { describe, expect, it } from "vitest";
import { chromeStep, chromeTouch, type ChromeScroll } from "../compact-chrome";

const run = (ys: number[], start = 500, atEnd = false) =>
  ys.reduce<ChromeScroll>((s, y) => chromeStep(s, y, atEnd), { last: start, anchor: start, compact: false });

describe("chromeStep (Safari's bottom-bar thresholds)", () => {
  it("ignores a short nudge down, collapses after 32px", () => {
    expect(run([510, 530]).compact).toBe(false);
    expect(run([510, 532]).compact).toBe(true);
  });

  it("stays small through a short scroll up, opens after 62px", () => {
    const small = run([600]);
    expect(small.compact).toBe(true);
    expect(run([600, 580, 545], 500).compact).toBe(true);
    expect(run([600, 570, 538], 500).compact).toBe(false);
  });

  it("measures each run from where the direction turned", () => {
    // Down 100, up 40 (stays small), down 10, up 61: no single upward run reaches 62px.
    expect(run([600, 560, 570, 509]).compact).toBe(true);
  });

  it("never adds up separate touches", () => {
    // Small after scrolling down; then three separate 40px pushes up, each its own touch.
    let s = run([600]);
    for (const y of [560, 520, 480]) s = chromeStep(chromeTouch(s, s.last), y, false);
    expect(s.compact).toBe(true);
  });

  it("is always open at the top and the end", () => {
    expect(run([600, 0]).compact).toBe(false);
    expect(run([600], 500, true).compact).toBe(false);
  });
});
