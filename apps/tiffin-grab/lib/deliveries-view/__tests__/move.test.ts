import { describe, expect, it } from "vitest";
import { moveOptions } from "../move";
import type { PlanContext, Trip } from "../index";

const NOW = Date.parse("2026-09-21T12:00:00Z");
const ctx: PlanContext = { cutoffHour: 18, timezone: "UTC", pooled: 0, lastDeliveryDate: "2026-10-02", deliveryWeekdays: ["mon", "wed", "fri"] };
const trip = { date: "2026-09-23", units: 1, coversDates: ["2026-09-23"], pooled: false } as Trip;

describe("moveOptions default horizon", () => {
  it("without an explicit horizon, offers up to the plan's last delivery plus a week", () => {
    const c = { ...ctx, lastDeliveryDate: "2026-10-02" }; // Fri, 11 days after today (2026-09-21)
    const o = moveOptions(trip, [], NOW, c, "2026-09-21");
    expect(o[o.length - 1]!.date).toBe("2026-10-08"); // horizon 18 = today + 17 days
  });
  it("falls back to 28 days for a plan with no known end", () => {
    const c = { ...ctx, lastDeliveryDate: null };
    const o = moveOptions(trip, [], NOW, c, "2026-09-21");
    expect(o).toHaveLength(28);
  });
  it("a not-yet-started plan offers dates from its own start date, not today", () => {
    const c = { ...ctx, startDate: "2026-09-28", lastDeliveryDate: "2026-10-02" };
    const o = moveOptions(trip, [], NOW, c, "2026-09-21");
    expect(o[0]!.date).toBe("2026-09-28");
    expect(o.some((x) => x.date < "2026-09-28")).toBe(false);
  });
  it("an already-started plan (start in the past) still starts from today", () => {
    const c = { ...ctx, startDate: "2026-09-01", lastDeliveryDate: "2026-10-02" };
    const o = moveOptions(trip, [], NOW, c, "2026-09-21");
    expect(o[0]!.date).toBe("2026-09-21");
  });
});

describe("moveOptions", () => {
  it("offers plan weekdays only, flags source, closed, held and merge days", () => {
    const o = moveOptions(trip, [
      { date: "2026-09-25", status: "scheduled", units: 3, covers: ["2026-09-24", "2026-09-25"] },
      { date: "2026-09-28", status: "skipped" },
    ], NOW, ctx, "2026-09-21");
    const at = (d: string) => o.find((x) => x.date === d)!;
    expect(at("2026-09-21").disabledReason).toMatch(/closed/);
    expect(at("2026-09-23").disabledReason).toMatch(/moving from/);
    expect(at("2026-09-25")).toMatchObject({ disabledReason: undefined, merge: { units: 4, covers: ["2026-09-24", "2026-09-25"] } });
    expect(at("2026-09-28").disabledReason).toMatch(/held/);
  });
  it("eat-day picks snap to the carrying trip: weekends ride Friday, off-pattern days the earlier trip", () => {
    const o = moveOptions(trip, [{ date: "2026-09-25", status: "scheduled", units: 1, covers: ["2026-09-25"] }], NOW, ctx, "2026-09-24", 5);
    const sat = o.find((x) => x.date === "2026-09-26")!;
    expect(sat).toMatchObject({ carriedOn: "2026-09-25", disabledReason: undefined });
    expect(sat.merge!.covers).toEqual(["2026-09-25", "2026-09-26"]);
    expect(o.find((x) => x.date === "2026-09-24")).toMatchObject({ carriedOn: "2026-09-23", disabledReason: "That day already rides on this trip." });
    expect(o.find((x) => x.date === "2026-09-27")!.carriedOn).toBe("2026-09-25");
  });
  it("blocks a move onto a delivery already carrying 3 tiffins, including days it carries", () => {
    const days = [{ date: "2026-09-23", status: "scheduled" as const, units: 3, covers: ["2026-09-23", "2026-09-24"], extras: ["2026-09-23"] }];
    const o = moveOptions({ ...trip, date: "2026-09-25", coversDates: ["2026-09-25"] } as Trip, days, NOW, ctx, "2026-09-22", 4);
    expect(o.find((x) => x.date === "2026-09-23")!.disabledReason).toMatch(/at most/);
    expect(o.find((x) => x.date === "2026-09-24")!.disabledReason).toMatch(/at most/);
  });
  it("pooled trip may only go after the last delivery to an open day", () => {
    const o = moveOptions({ ...trip, pooled: true }, [], NOW, ctx, "2026-09-30", 10);
    expect(o.find((x) => x.date === "2026-09-30")!.disabledReason).toMatch(/after Fri, Oct 2/);
    expect(o.find((x) => x.date === "2026-10-05")!.disabledReason).toBeUndefined();
  });
});
