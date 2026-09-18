import { describe, expect, it } from "vitest";
import {
  decorateDay,
  isoDateInZone,
  isoWeekMonday,
  kpis,
  parseAssumptions,
  periodKey,
  rollup,
  ZERO_ASSUMPTIONS,
} from "../profitability";

describe("parseAssumptions", () => {
  it("treats missing or negative values as zero", () => {
    expect(parseAssumptions(null)).toEqual(ZERO_ASSUMPTIONS);
    expect(parseAssumptions({ kitchenCostPerTiffin: -4, marketingMonthly: "30" }).kitchenCostPerTiffin).toBe(0);
    expect(parseAssumptions({ marketingMonthly: "30" }).marketingMonthly).toBe(30);
  });
});

describe("decorateDay", () => {
  it("spreads a monthly budget across every calendar day, including days with no tiffins", () => {
    // January 2026 has 31 days. $310 marketing → $10/day even with zero deliveries.
    const row = decorateDay(
      { date: "2026-01-15", tiffins: 0, revenue: 0, cashCollected: 0 },
      { ...ZERO_ASSUMPTIONS, marketingMonthly: 310 },
    );
    expect(row.marketing).toBe(10);
    expect(row.profit).toBe(-10);
    expect(row.marginPct).toBeNull();
  });

  it("applies kitchen and driver as per-tiffin variable costs", () => {
    const row = decorateDay(
      { date: "2026-01-15", tiffins: 4, revenue: 80, cashCollected: 0 },
      { ...ZERO_ASSUMPTIONS, kitchenCostPerTiffin: 5, driverCostPerTiffin: 2 },
    );
    expect(row.kitchen).toBe(20);
    expect(row.driver).toBe(8);
    expect(row.profit).toBe(52);
    expect(row.marginPct).toBe(65);
  });
});

describe("rollup", () => {
  it("keeps cash and revenue separate when summing a week", () => {
    const a = decorateDay(
      { date: "2026-01-05", tiffins: 10, revenue: 100, cashCollected: 200 },
      ZERO_ASSUMPTIONS,
    );
    const b = decorateDay(
      { date: "2026-01-06", tiffins: 10, revenue: 100, cashCollected: 0 },
      ZERO_ASSUMPTIONS,
    );
    expect(isoWeekMonday("2026-01-05")).toBe("2026-01-05");
    expect(periodKey("2026-01-06", "weekly")).toBe("2026-01-05");
    const [week] = rollup([a, b], "weekly");
    expect(week?.revenue).toBe(200);
    expect(week?.cashCollected).toBe(200);
    expect(week?.tiffins).toBe(20);
  });
});

describe("kpis", () => {
  it("reports profit per tiffin from the rolled-up profit, not from cash", () => {
    const rows = [
      decorateDay({ date: "2026-01-01", tiffins: 10, revenue: 50, cashCollected: 200 }, ZERO_ASSUMPTIONS),
      decorateDay({ date: "2026-01-02", tiffins: 10, revenue: 50, cashCollected: 0 }, ZERO_ASSUMPTIONS),
    ];
    const s = kpis(rows);
    expect(s.cashCollected).toBe(200);
    expect(s.revenue).toBe(100);
    expect(s.profitPerTiffin).toBe(5);
  });
});

describe("isoDateInZone", () => {
  it("uses the business timezone, not UTC", () => {
    // 04:00 UTC is still 1 Jan in Toronto (EST, UTC-5).
    expect(isoDateInZone(Date.parse("2035-01-02T04:00:00Z"), "America/Toronto")).toBe("2035-01-01");
    expect(isoDateInZone(Date.parse("2035-01-02T05:00:00Z"), "America/Toronto")).toBe("2035-01-02");
  });
});
