import { describe, expect, it } from "vitest";
import { dayLabel, groupByWeek, weekLabel, type ScorecardDay } from "../daily-scorecard";

const day = (date: string, revenue: number, profit: number | null = null): ScorecardDay => ({
  date, revenue, orders: 1, deliveries: 2, skipped: 0, signups: 0, complaints: 0, profit, href: "#",
});

describe("groupByWeek", () => {
  it("groups Mon–Sun, oldest week first, and sums each column", () => {
    const weeks = groupByWeek([day("2026-11-01", 5, 1), day("2026-10-31", 10, null), day("2026-10-26", 20, -3), day("2026-10-25", 7)]);
    expect(weeks.map((w) => [w.start, w.end])).toEqual([
      ["2026-10-19", "2026-10-25"],
      ["2026-10-26", "2026-11-01"],
    ]);
    expect(weeks[1]).toMatchObject({ revenue: 35, orders: 3, deliveries: 6, profit: -2 });
    expect(weeks[0]).toMatchObject({ revenue: 7, profit: null });
  });
});

describe("labels", () => {
  it("formats day and week labels", () => {
    expect(dayLabel("2026-10-31")).toBe("Oct 31 · Saturday");
    expect(weekLabel("2026-10-26", "2026-11-01")).toBe("Oct 26 – Nov 1");
  });
});
