import { describe, expect, it } from "vitest";
import { costBreakdown, decorateDay, ZERO_ASSUMPTIONS } from "../profitability";
import { profitCalendar } from "../profit-calendar";

const day = (date: string, tiffins: number) => decorateDay({ date, tiffins, revenue: tiffins * 10, cashCollected: 0 }, ZERO_ASSUMPTIONS);

describe("profitCalendar", () => {
  it("shows Mon-Fri, omits empty days and empty weeks", () => {
    // 2035-01-01 is a Monday.
    const rows = ["2035-01-01", "2035-01-02", "2035-01-03", "2035-01-09", "2035-01-15"].map((d, i) => day(d, i === 1 ? 0 : 2));
    const { columns, weeks } = profitCalendar(rows, "2035-01-01", "2035-01-31");
    expect(columns).toBe(5);
    expect(weeks).toHaveLength(3); // Jan 1-5, Jan 8-12, Jan 15-19; Jan 22+ empty
    expect(weeks[0]!.map((r) => r?.date ?? null)).toEqual(["2035-01-01", null, "2035-01-03", null, null]);
    expect(weeks[1]!.map((r) => r?.date ?? null)).toEqual([null, "2035-01-09", null, null, null]);
  });

  it("adds Sat and Sun only when they had deliveries", () => {
    const { columns, weeks } = profitCalendar([day("2035-01-06", 1)], "2035-01-01", "2035-01-31");
    expect(columns).toBe(7);
    expect(weeks[0]![5]?.date).toBe("2035-01-06");
  });

  it("is empty with no deliveries", () => {
    expect(profitCalendar([day("2035-01-01", 0)], "2035-01-01", "2035-01-31").weeks).toEqual([]);
  });
});

describe("costBreakdown", () => {
  it("adds up to the row costs", () => {
    const a = { ...ZERO_ASSUMPTIONS, kitchenCostPerTiffin: 3, otherCostPerTiffin: 1, otherMonthly: 310, marketingMonthly: 310 };
    const rows = [decorateDay({ date: "2035-01-05", tiffins: 2, revenue: 20, cashCollected: 0 }, a)];
    const parts = Object.fromEntries(costBreakdown(rows).map((p) => [p.label, p.value]));
    expect(parts).toMatchObject({ Kitchen: 6, Other: 12, Marketing: 10 });
    expect(Object.values(parts).reduce((s, v) => s + v, 0)).toBe(rows[0]!.costs);
  });
});
