import { describe, expect, it } from "vitest";
import { defaultWeek, mondayOf, parseWeekParam, type Agenda } from "../week";

const dot = (deliveryDate: string) => ({ orderId: "o", status: "scheduled" as const, cutoffAt: 0, deliveryDate, truck: true, units: 1, covers: [deliveryDate] });

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
  it("defaultWeek is the current week when any plan has a day in it", () => {
    const a: Agenda = { "2026-09-23": [dot("2026-09-23")] };
    expect(defaultWeek("2026-09-21", a)).toBe("2026-09-21");
  });
  it("defaultWeek jumps to the week of the next delivery across plans when this week is empty", () => {
    const a: Agenda = { "2026-10-07": [dot("2026-10-07")], "2026-10-16": [dot("2026-10-16")] };
    expect(defaultWeek("2026-09-21", a)).toBe("2026-10-05");
  });
  it("defaultWeek falls back to this week with nothing scheduled", () => {
    expect(defaultWeek("2026-09-23", {})).toBe("2026-09-21");
  });
});
