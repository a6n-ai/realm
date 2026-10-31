import { describe, expect, it } from "vitest";
import { bucketCounts, chartPeriod } from "../buckets";

describe("chartPeriod", () => {
  it("labels ticks short and tooltips long", () => {
    expect(chartPeriod("2026-10-03", "daily")).toEqual({ period: "Oct 3", tip: "Sat, Oct 3" });
    expect(chartPeriod("2026-10-05", "weekly")).toEqual({ period: "Oct 5", tip: "Week of Mon, Oct 5" });
    expect(chartPeriod("2026-10", "monthly").period).toBe("Oct 2026");
  });
});

describe("bucketCounts", () => {
  it("zero-fills days and keeps totals", () => {
    const rows = bucketCounts([{ iso: "2026-10-02", a: 3, b: 1 }, { iso: "2026-10-04", a: 2, b: 0 }], ["a", "b"], "2026-10-01", "2026-10-05");
    expect(rows.map((r) => r.a)).toEqual([0, 3, 0, 2, 0]);
    expect(rows[1]).toMatchObject({ period: "Oct 2", tip: "Fri, Oct 2", b: 1 });
  });
  it("re-buckets to weeks beyond 45 days, sums intact", () => {
    const rows = bucketCounts([{ iso: "2026-10-07", a: 5 }, { iso: "2026-10-09", a: 4 }], ["a"], "2026-09-28", "2026-12-01");
    expect(rows.reduce((s, r) => s + r.a, 0)).toBe(9);
    expect(rows[1]).toMatchObject({ period: "Oct 5", a: 9 });
  });
});
