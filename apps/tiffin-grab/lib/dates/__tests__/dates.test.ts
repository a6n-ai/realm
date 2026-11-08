import { describe, expect, it } from "vitest";
import { addDaysIso, dayRange, daysBetween, eachDate, isRealDate, isoDateInZone, mondayIndex, mondayOfIso } from "../index";

describe("lib/dates", () => {
  it("addDaysIso rolls across months and years", () => {
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("mondayOfIso snaps every weekday, Sunday included, to its Monday", () => {
    expect(mondayOfIso("2026-06-24")).toBe("2026-06-22");
    expect(mondayOfIso("2026-06-22")).toBe("2026-06-22");
    expect(mondayOfIso("2026-06-28")).toBe("2026-06-22");
    expect(mondayIndex("2026-10-01")).toBe(3);
  });

  it("daysBetween counts signed calendar days", () => {
    expect(daysBetween("2026-08-19", "2026-09-02")).toBe(14);
    expect(daysBetween("2026-08-19", "2026-08-18")).toBe(-1);
  });

  it("eachDate is inclusive and empty when reversed", () => {
    expect(eachDate("2026-02-27", "2026-03-02")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
    expect(eachDate("2026-03-02", "2026-02-27")).toEqual([]);
  });

  it("isRealDate rejects rollover and malformed dates", () => {
    expect(isRealDate("2026-02-28")).toBe(true);
    expect(isRealDate("2026-02-30")).toBe(false);
    expect(isRealDate("2026-2-3")).toBe(false);
  });

  it("dayRange spans a 23-hour DST day in the zone", () => {
    const { start, end } = dayRange("2026-03-08", "America/Toronto");
    expect(end - start).toBe(23 * 3_600_000);
    expect(isoDateInZone(start, "America/Toronto")).toBe("2026-03-08");
    expect(isoDateInZone(end - 1, "America/Toronto")).toBe("2026-03-08");
  });
});
