import { describe, it, expect } from "vitest";
import { computeTax } from "../index";

describe("computeTax", () => {
  it("returns zero for no tax lines", () => {
    expect(computeTax(100, [])).toEqual({ lines: [], taxTotal: 0 });
  });
  it("computes multiple lines, each rounded to cents", () => {
    const r = computeTax(100, [{ name: "GST", ratePct: 5 }, { name: "PST", ratePct: 7 }]);
    expect(r.lines).toEqual([
      { name: "GST", ratePct: 5, amount: 5 },
      { name: "PST", ratePct: 7, amount: 7 },
    ]);
    expect(r.taxTotal).toBe(12);
  });
  it("rounds each line independently (13.333 base @ 5% => 0.67)", () => {
    const r = computeTax(13.333, [{ name: "GST", ratePct: 5 }]);
    expect(r.lines[0].amount).toBe(0.67);
    expect(r.taxTotal).toBe(0.67);
  });
  it("clamps a negative base to 0", () => {
    expect(computeTax(-50, [{ name: "GST", ratePct: 5 }])).toEqual({
      lines: [{ name: "GST", ratePct: 5, amount: 0 }],
      taxTotal: 0,
    });
  });
});
