import { describe, expect, it } from "vitest";
import { validateStartDate, earliestPlanStart } from "../start-date";

const ALL = ["mon", "tue", "wed", "thu", "fri"];
// Fixed "today" = Monday 2026-06-22 for deterministic boundaries.
const today = new Date(Date.UTC(2026, 5, 22));

describe("validateStartDate", () => {
  it("accepts the next weekday after today", () => {
    expect(() => validateStartDate("2026-06-23", ALL, today)).not.toThrow(); // Tue
  });
  it("rejects a date before the next weekday (today or earlier)", () => {
    expect(() => validateStartDate("2026-06-22", ALL, today)).toThrow(); // today
    expect(() => validateStartDate("2026-06-19", ALL, today)).toThrow(); // past
  });
  it("rejects Saturday and Sunday", () => {
    expect(() => validateStartDate("2026-06-27", ALL, today)).toThrow(); // Sat
    expect(() => validateStartDate("2026-06-28", ALL, today)).toThrow(); // Sun
  });
  it("rejects a weekday not in allowedStartDays", () => {
    expect(() => validateStartDate("2026-06-23", ["mon", "wed", "fri"], today)).toThrow(); // Tue not allowed
  });
  it("accepts a later allowed weekday", () => {
    expect(() => validateStartDate("2026-06-24", ["mon", "wed", "fri"], today)).not.toThrow(); // Wed
  });
  it("rejects a malformed date string", () => {
    expect(() => validateStartDate("2026/06/23", ALL, today)).toThrow();
  });
});

describe("earliestPlanStart", () => {
  const thu = new Date(Date.UTC(2026, 9, 8)); // Thu Oct 8 2026
  const weekdays = ["mon", "tue", "wed", "thu", "fri"];

  it("is tomorrow's weekday when nothing runs", () => {
    expect(earliestPlanStart(thu, weekdays, null)).toBe("2026-10-09");
  });

  it("starts after a running plan, on a day the plan starts on", () => {
    expect(earliestPlanStart(thu, weekdays, "2026-10-31")).toBe("2026-11-02"); // Sat → Mon
    expect(earliestPlanStart(thu, ["wed"], "2026-10-27")).toBe("2026-10-28");
  });

  it("ignores a running-plan bound that is already past", () => {
    expect(earliestPlanStart(thu, weekdays, "2026-10-01")).toBe("2026-10-09");
  });
});
