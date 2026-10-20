import { describe, expect, it } from "vitest";
import { defaultWeek, mondayOf, parseWeekParam, splitAgenda, type AgendaDot } from "../week";

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

describe("splitAgenda", () => {
  const dot = (orderId: string, date: string, extra: Partial<AgendaDot> = {}): AgendaDot =>
    ({ orderId, status: "scheduled", cutoffAt: 0, deliveryDate: date, truck: true, units: 1, covers: [date], ...extra });
  it("keeps this plan's dots and lists the other plan's live delivery days", () => {
    const { agenda, otherPlanDays } = splitAgenda({
      "2026-10-19": [dot("old", "2026-10-19")],
      "2026-10-21": [dot("old", "2026-10-21")],
      "2026-10-22": [dot("new", "2026-10-22")],
      "2026-10-23": [dot("new", "2026-10-23", { status: "skipped" })],
      "2026-10-24": [dot("new", "2026-10-23", { truck: false })],
      "2026-10-26": [dot("new", "2026-10-26", { moved: true })],
    }, "old", "2026-09-25");
    expect(Object.keys(agenda)).toEqual(["2026-10-19", "2026-10-21"]);
    // A held day or a moved-away date is not a delivery; only the truck day counts.
    expect(otherPlanDays).toEqual({ "2026-10-22": "renewal" });
  });
  it("names a plan that delivers before this one starts the earlier plan", () => {
    expect(splitAgenda({ "2026-10-19": [dot("old", "2026-10-19")] }, "new", "2026-10-22").otherPlanDays).toEqual({ "2026-10-19": "earlier plan" });
  });
});
