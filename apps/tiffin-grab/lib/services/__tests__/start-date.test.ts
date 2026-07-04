import { describe, expect, it } from "vitest";
import { validateStartDate } from "../start-date";

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
