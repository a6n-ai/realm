// @vitest-environment node
import { describe, expect, it } from "vitest";
import { monthFetchRange, parseMonthParam, pickCalendarSelectedDay, calendarRailDays } from "../calendar-constants";

describe("calendar month helpers", () => {
  it("monthFetchRange spans the calendar month", () => {
    expect(monthFetchRange("2026-07", "2026-06-01")).toEqual({ from: "2026-07-01", until: "2026-07-31" });
  });

  it("parseMonthParam defaults to this month and clamps past months", () => {
    expect(parseMonthParam(undefined, "2026-07-20")).toBe("2026-07");
    expect(parseMonthParam("2026-06", "2026-07-20")).toBe("2026-07");
  });

  it("monthFetchRange does not start before today in the current month", () => {
    expect(monthFetchRange("2026-07", "2026-07-22")).toEqual({ from: "2026-07-22", until: "2026-07-31" });
  });
});

describe("pickCalendarSelectedDay", () => {
  it("keeps today when it is a delivery day", () => {
    expect(pickCalendarSelectedDay(["2026-08-18", "2026-08-19"], "2026-08-18")).toBe("2026-08-18");
  });

  it("advances to the next delivery when today is off", () => {
    expect(pickCalendarSelectedDay(["2026-08-19", "2026-08-20"], "2026-08-18")).toBe("2026-08-19");
  });

  it("falls back to today when the plan has no dates", () => {
    expect(pickCalendarSelectedDay([], "2026-08-18")).toBe("2026-08-18");
  });
});

describe("calendarRailDays", () => {
  it("includes today even when the first delivery is later", () => {
    expect(calendarRailDays(["2026-08-19", "2026-08-21"], "2026-08-18")).toEqual([
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
    ]);
  });
});
