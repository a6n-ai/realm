import { describe, expect, it } from "vitest";
import { weekTimeline, type Agenda, type AgendaDot } from "../week";

const dot = (deliveryDate: string, covers: string[], over: Partial<AgendaDot> = {}, eat = deliveryDate): AgendaDot => ({
  orderId: "o1", status: "scheduled", cutoffAt: 0, deliveryDate, truck: eat === deliveryDate, units: covers.length, covers, ...over,
});

describe("weekTimeline", () => {
  it("groups eating days under their truck day, coloured by status", () => {
    const agenda: Agenda = {
      "2026-10-12": [dot("2026-10-12", ["2026-10-12", "2026-10-13"], { optimoCompletionStatus: "success" })],
      "2026-10-13": [dot("2026-10-12", ["2026-10-12", "2026-10-13"], { optimoCompletionStatus: "success" }, "2026-10-13")],
      "2026-10-14": [dot("2026-10-14", ["2026-10-14"], { status: "skipped" })],
      "2026-10-16": [dot("2026-10-16", ["2026-10-16"])],
    };
    const r = weekTimeline(agenda, "2026-10-12", 0);
    expect(r.trips).toEqual([
      { day: "mon", units: 2, days: ["mon", "tue"], status: "delivered" },
      { day: "wed", units: 1, days: ["wed"], status: "hold" },
      { day: "fri", units: 1, days: ["fri"], status: "upcoming" },
    ]);
    expect(r.dayStatus).toEqual({ mon: "delivered", tue: "delivered", wed: "hold", fri: "upcoming" });
  });

  it("drops covered days that fall in another week", () => {
    const agenda: Agenda = { "2026-10-16": [dot("2026-10-16", ["2026-10-16", "2026-10-19"])] };
    expect(weekTimeline(agenda, "2026-10-12", 0).trips[0]!.days).toEqual(["fri"]);
  });
});
