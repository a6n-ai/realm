import { describe, expect, it } from "vitest";
import { addMonth, monthEnd, monthGrid, parseMonth } from "../calendar";

describe("studio month calendar", () => {
  it("defaults a missing month to the current month in the app timezone", () => {
    expect(parseMonth(undefined, "Asia/Singapore", new Date("2026-10-15T02:00:00.000Z"))).toBe("2026-10");
    expect(parseMonth("2026-09", "Asia/Singapore")).toBe("2026-09");
  });

  it("steps months and finds the last day", () => {
    expect(addMonth("2026-09", 1)).toBe("2026-10");
    expect(addMonth("2026-12", 1)).toBe("2027-01");
    expect(monthEnd("2026-09")).toBe("2026-09-30");
    expect(monthEnd("2026-02")).toBe("2026-02-28");
  });

  it("builds a Monday-first grid that covers the month", () => {
    const grid = monthGrid("2026-09");
    expect(grid).toHaveLength(42);
    expect(grid[0]).toEqual({ date: "2026-08-31", inMonth: false });
    expect(grid[1]).toEqual({ date: "2026-09-01", inMonth: true });
    expect(grid.some((cell) => cell.date === "2026-09-30" && cell.inMonth)).toBe(true);
  });
});
