import { describe, expect, it } from "vitest";
import { plannedSchedule } from "../schedule-card";

const mwf = { key: "mwf", weekdays: ["mon", "wed", "fri"] };

describe("plannedSchedule", () => {
  it("weekly: the same dates materializeDeliveries writes, carried days included", () => {
    const r = plannedSchedule({ kind: "weekly", startDate: "2026-10-06", durationWeeks: 2, frequency: mwf, eatingDays: ["mon", "tue", "wed", "thu", "fri"] });
    expect(r!.trips.map((t) => [t.dateIso, t.units])).toEqual([
      ["2026-10-07", 2], ["2026-10-09", 1], ["2026-10-12", 2], ["2026-10-14", 2], ["2026-10-16", 1], ["2026-10-19", 2],
    ]);
    expect(r!.shifted).toBe(true);
  });
  it("trial: one tiffin on each picked day", () => {
    const r = plannedSchedule({ kind: "trial", startDate: "2026-10-07", picks: ["wed", "fri"] });
    expect(r!.trips.map((t) => [t.dateIso, t.units, t.days])).toEqual([["2026-10-07", 1, ["wed"]], ["2026-10-09", 1, ["fri"]]]);
  });
  it("null while incomplete or invalid, never throws", () => {
    expect(plannedSchedule({ kind: "weekly", startDate: "", durationWeeks: 2, frequency: mwf, eatingDays: ["mon"] })).toBeNull();
    expect(plannedSchedule({ kind: "weekly", startDate: "0002-10-06", durationWeeks: 2, frequency: mwf, eatingDays: ["mon"] })).toBeNull();
    expect(plannedSchedule({ kind: "trial", startDate: "2026-10-07", picks: [] })).toBeNull();
  });
});
