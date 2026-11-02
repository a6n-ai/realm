import { describe, expect, it } from "vitest";
import { groupProfitWeeks } from "../profit-weeks";
import type { ProfitRow } from "../profitability";

const day = (date: string, n: number): ProfitRow => ({
  date, tiffins: n, revenue: n * 10, cashCollected: n * 9, unpaidRevenue: 0,
  kitchen: n * 3, driver: n, marketing: 1, salaries: 2, other: 0.5, costs: n * 4 + 3.5, profit: n * 6 - 3.5, marginPct: null,
});

describe("groupProfitWeeks", () => {
  it("sums day cards into Mon–Sun weeks", () => {
    const days = [day("2026-10-26", 2), day("2026-10-30", 3), day("2026-11-02", 4), day("2026-10-25", 1)];
    const weeks = groupProfitWeeks(days);
    expect(weeks.map((w) => [w.start, w.end])).toEqual([
      ["2026-10-19", "2026-10-25"],
      ["2026-10-26", "2026-11-01"],
      ["2026-11-02", "2026-11-08"],
    ]);
    for (const k of ["tiffins", "revenue", "costs", "profit", "kitchen"] as const) {
      expect(weeks.reduce((s, w) => s + w.row[k], 0)).toBeCloseTo(days.reduce((s, d) => s + d[k], 0), 2);
    }
    expect(weeks[1]!.row).toMatchObject({ tiffins: 5, revenue: 50, costs: 27, profit: 23 });
    expect(weeks[1]!.row.marginPct).toBe(46);
  });
});
