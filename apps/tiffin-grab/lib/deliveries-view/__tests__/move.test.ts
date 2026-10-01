import { describe, expect, it } from "vitest";
import { moveLockReason, moveOptions } from "../move";
import type { PlanContext, Trip } from "../index";

const NOW = Date.parse("2026-09-21T12:00:00Z");
const ctx: PlanContext = { cutoffHour: 18, timezone: "UTC", lastDeliveryDate: "2026-10-02", deliveryWeekdays: ["mon", "wed", "fri"] };
const trip = { date: "2026-09-23", units: 1, coversDates: ["2026-09-23"] } as Trip;

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
  it("offers plan weekdays only, flags source, closed, not-going-out and merge days", () => {
    const o = moveOptions(trip, [
      { date: "2026-09-25", status: "scheduled", units: 3, covers: ["2026-09-24", "2026-09-25"] },
      { date: "2026-09-28", status: "skipped" },
    ], NOW, ctx, "2026-09-21");
    const at = (d: string) => o.find((x) => x.date === d)!;
    expect(at("2026-09-21").disabledReason).toMatch(/closed/);
    expect(at("2026-09-23").disabledReason).toMatch(/moving from/);
    expect(at("2026-09-25")).toMatchObject({ disabledReason: undefined, merge: { units: 4, covers: ["2026-09-24", "2026-09-25"] } });
    expect(at("2026-09-28").disabledReason).toMatch(/isn't going out/);
  });
  it("eat-day picks snap to the carrying trip: weekends ride Friday, off-pattern days the earlier trip", () => {
    const o = moveOptions({ ...trip, status: "upcoming" } as Trip, [{ date: "2026-09-25", status: "scheduled", units: 1, covers: ["2026-09-25"] }], NOW, ctx, "2026-09-24", 5);
    const sat = o.find((x) => x.date === "2026-09-26")!;
    expect(sat).toMatchObject({ carriedOn: "2026-09-25", disabledReason: undefined });
    expect(sat.merge!.covers).toEqual(["2026-09-25", "2026-09-26"]);
    expect(o.find((x) => x.date === "2026-09-24")).toMatchObject({ carriedOn: "2026-09-23", disabledReason: expect.stringMatching(/closed/) });
    expect(o.find((x) => x.date === "2026-09-27")!.carriedOn).toBe("2026-09-25");
  });
  it("same truck: Wed's tiffin can become Thu's on the Wed delivery, units unchanged; not on a failed one", () => {
    const up = { ...trip, status: "upcoming" } as Trip;
    const thu = moveOptions(up, [], NOW, ctx, "2026-09-21", 4).find((x) => x.date === "2026-09-24")!;
    expect(thu).toMatchObject({ carriedOn: "2026-09-23", disabledReason: undefined, merge: { units: 1, covers: ["2026-09-24"] } });
    const failed = moveOptions({ ...trip, status: "failed" } as Trip, [], NOW, ctx, "2026-09-21", 4).find((x) => x.date === "2026-09-24")!;
    expect(failed.disabledReason).toMatch(/isn't going out/);
  });
  it("no per-day cap: a day may take a third tiffin as long as the delivery stays at 3", () => {
    const days = [{ date: "2026-09-25", status: "scheduled" as const, units: 2, covers: ["2026-09-25"], extras: ["2026-09-25"] }];
    const o = moveOptions({ ...trip, status: "upcoming", coversDates: ["2026-09-23", "2026-09-24"], units: 2 } as Trip, days, NOW, ctx, "2026-09-21", 5);
    expect(o.find((x) => x.date === "2026-09-25")).toMatchObject({ disabledReason: undefined, merge: { units: 3, covers: ["2026-09-25"] } });
  });
  it("a tiffin moved onto a day can't move again; the day's own tiffin still can", () => {
    const t = { ...trip, coversDates: ["2026-09-23"], extraDates: ["2026-09-23"], movesIn: [{ from: "2026-09-25", to: "2026-09-23" }] } as Trip;
    expect(moveLockReason(t, "2026-09-23")).toBeNull();
    const t2 = { ...t, movesIn: [...t.movesIn!, { from: "2026-09-21", to: "2026-09-23" }] } as Trip;
    expect(moveLockReason(t2, "2026-09-23")).toMatch(/already moved/);
  });
  it("a day emptied by moves is open again, not a held trip", () => {
    const o = moveOptions({ ...trip, status: "upcoming" } as Trip, [{ date: "2026-09-25", status: "skipped", emptied: true }], NOW, ctx, "2026-09-21", 5);
    expect(o.find((x) => x.date === "2026-09-25")).toMatchObject({ disabledReason: undefined, merge: null });
  });
  it("blocks a move onto a delivery already carrying 3 tiffins, including days it carries", () => {
    const days = [{ date: "2026-09-23", status: "scheduled" as const, units: 3, covers: ["2026-09-23", "2026-09-24"], extras: ["2026-09-23"] }];
    const o = moveOptions({ ...trip, date: "2026-09-25", coversDates: ["2026-09-25"] } as Trip, days, NOW, ctx, "2026-09-22", 4);
    expect(o.find((x) => x.date === "2026-09-23")!.disabledReason).toMatch(/at most/);
    expect(o.find((x) => x.date === "2026-09-24")!.disabledReason).toMatch(/at most/);
  });
  it("splits Friday lead day (1 tiffin) when frequencyKey is 5_day", () => {
    const friTrip = { date: "2026-09-25", units: 3, coversDates: ["2026-09-25", "2026-09-26", "2026-09-27"] } as Trip;
    const ctx5Day: PlanContext = { ...ctx, frequencyKey: "5_day", deliveryWeekdays: ["mon", "tue", "wed", "thu", "fri"] };
    const monTarget = { date: "2026-09-28", status: "scheduled" as const, units: 1, covers: ["2026-09-28"] };
    const o = moveOptions(friTrip, [monTarget], NOW, ctx5Day, "2026-09-22", 10, "2026-09-25");
    const mon = o.find((x) => x.date === "2026-09-28")!;
    expect(mon.disabledReason).toBeUndefined();
    // Monday (1 unit) + split Friday (1 unit) = 2 units (not 1 + 3 = 4)
    expect(mon.merge).toEqual({ units: 2, covers: ["2026-09-28"] }); // Fri's tiffin becomes a second Monday tiffin
  });
  it("splits Friday lead day (1 tiffin) on mwf, so it does not drag Sat and Sun along", () => {
    const friTrip = { date: "2026-09-25", units: 3, coversDates: ["2026-09-25", "2026-09-26", "2026-09-27"] } as Trip;
    const ctxMwf: PlanContext = { ...ctx, frequencyKey: "mwf", deliveryWeekdays: ["mon", "wed", "fri"] };
    const monTarget = { date: "2026-09-28", status: "scheduled" as const, units: 1, covers: ["2026-09-28"] };
    const o = moveOptions(friTrip, [monTarget], NOW, ctxMwf, "2026-09-22", 10, "2026-09-25");
    const mon = o.find((x) => x.date === "2026-09-28")!;
    expect(mon.disabledReason).toBeUndefined();
    // Monday (1 unit) + Friday only (1 unit) = 2, not the whole Fri+Sat+Sun bundle
    expect(mon.merge).toEqual({ units: 2, covers: ["2026-09-28"] }); // Fri's tiffin becomes a second Monday tiffin
  });
  it("splits Saturday off Friday (1 tiffin) even on mwf", () => {
    const friTrip = { date: "2026-09-25", units: 3, coversDates: ["2026-09-25", "2026-09-26", "2026-09-27"] } as Trip;
    const ctxMwf: PlanContext = { ...ctx, frequencyKey: "mwf", deliveryWeekdays: ["mon", "wed", "fri"] };
    const monTarget = { date: "2026-09-28", status: "scheduled" as const, units: 1, covers: ["2026-09-28"] };
    const o = moveOptions(friTrip, [monTarget], NOW, ctxMwf, "2026-09-22", 10, "2026-09-26");
    const mon = o.find((x) => x.date === "2026-09-28")!;
    expect(mon.disabledReason).toBeUndefined();
    // Monday (1 unit) + split Saturday (1 unit) = 2 units
    expect(mon.merge).toEqual({ units: 2, covers: ["2026-09-28"] });
  });
});

describe("moveOptions weekend dish", () => {
  it("disables Sat/Sun only when the meal has no weekend dish", () => {
    const at = (c: PlanContext, d: string) => moveOptions(trip, [], NOW, c, "2026-09-21").find((x) => x.date === d)!;
    expect(at({ ...ctx, servesWeekends: false }, "2026-09-26").disabledReason).toMatch(/no weekend dish/);
    expect(at({ ...ctx, servesWeekends: false }, "2026-09-27").disabledReason).toMatch(/no weekend dish/);
    expect(at({ ...ctx, servesWeekends: false }, "2026-09-25").disabledReason).toBeUndefined();
    expect(at(ctx, "2026-09-26").disabledReason).toBeUndefined();
  });
});
