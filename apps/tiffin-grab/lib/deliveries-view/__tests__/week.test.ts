import { describe, expect, it } from "vitest";
import { defaultWeek, mondayOf, parseWeekParam } from "../week";

describe("week helpers", () => {
  it("mondayOf snaps any day to its Monday", () => {
    expect(mondayOf("2026-09-27")).toBe("2026-09-21");
    expect(mondayOf("2026-09-21")).toBe("2026-09-21");
  });
  it("parseWeekParam accepts a real date and snaps it, rejects junk", () => {
    expect(parseWeekParam("2026-09-23")).toBe("2026-09-21");
    expect(parseWeekParam("nope")).toBeNull();
    expect(parseWeekParam("2026-13-45")).toBeNull();
    expect(parseWeekParam(undefined)).toBeNull();
  });
  it("defaultWeek is the current week once the plan has started, even with no delivery this week", () => {
    expect(defaultWeek("2026-09-23", "2026-09-01")).toBe("2026-09-21");
  });
  it("defaultWeek is the plan's start week before it starts", () => {
    expect(defaultWeek("2026-09-23", "2026-12-02")).toBe("2026-11-30");
  });
  it("defaultWeek falls back to this week with no plan window", () => {
    expect(defaultWeek("2026-09-23", null)).toBe("2026-09-21");
  });
});
