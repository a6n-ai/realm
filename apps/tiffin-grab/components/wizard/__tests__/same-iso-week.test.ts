import { describe, expect, it } from "vitest";
import { anySameIsoWeek, isoWeekKey, sameIsoWeek } from "../same-iso-week";

describe("sameIsoWeek", () => {
  it("groups Mon–Sun of the same ISO week", () => {
    // 2026-07-20 is Monday; 2026-07-26 is Sunday of that week
    expect(sameIsoWeek("2026-07-20", "2026-07-26")).toBe(true);
    expect(sameIsoWeek("2026-07-19", "2026-07-20")).toBe(false);
  });

  it("anySameIsoWeek matches any existing date", () => {
    expect(anySameIsoWeek("2026-07-22", ["2026-07-01", "2026-07-20"])).toBe(true);
    expect(anySameIsoWeek("2026-08-01", ["2026-07-20"])).toBe(false);
  });

  it("isoWeekKey rejects malformed dates", () => {
    expect(isoWeekKey("nope")).toBeNull();
    expect(isoWeekKey("2026-07-20")).toMatch(/^2026-W\d{2}$/);
  });
});
