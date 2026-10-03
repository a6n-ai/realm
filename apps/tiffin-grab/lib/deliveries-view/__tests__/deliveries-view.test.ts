import { describe, expect, it } from "vitest";
import { actionAvailability, buildDayStatusMap, buildTrips, type CalendarDayInput, type PlanContext, type TripAction } from "../index";

// Mon 2026-09-21 12:00 America/Toronto (EDT, UTC-4)
const NOW = Date.UTC(2026, 8, 21, 16, 0);
const plan: PlanContext = { cutoffHour: 18, timezone: "America/Toronto", lastDeliveryDate: "2026-10-02", deliveryWeekdays: ["mon", "wed", "fri"] };

const day = (o: Partial<CalendarDayInput> & { date: string }): CalendarDayInput => ({
  status: "scheduled", locked: false, isMakeup: false, menuWeekId: null, meal: null, options: [], ...o,
});
const one = (o: Partial<CalendarDayInput> & { date: string }, p: PlanContext = plan, now = NOW) => buildTrips([day(o)], now, p)[0]!;
const ACTIONS: TripAction[] = ["pick", "swap", "move", "address"];
const CLOSED = "Changes closed Tue 6:00 pm. This trip is being prepared.";

describe("buildTrips status", () => {
  const rows: [string, Partial<CalendarDayInput> & { date: string }, string][] = [
    ["future scheduled", { date: "2026-09-23" }, "upcoming"],
    ["cutoff passed, delivery day not reached", { date: "2026-09-22", locked: true }, "cutoff-passed"],
    ["cutoff passed via clock only", { date: "2026-09-22", cutoffAt: NOW - 1 }, "cutoff-passed"],
    ["today, not confirmed yet", { date: "2026-09-21", locked: true }, "unconfirmed"],
    ["today, confirmed by OptimoRoute or an admin", { date: "2026-09-21", locked: true, optimoCompletionStatus: "success" }, "delivered"],
    ["skipped (a failed drop; nobody holds days)", { date: "2026-09-25", status: "skipped" }, "failed"],
    ["skipped, rescheduled", { date: "2026-09-25", status: "skipped", rescheduled: true }, "rescheduled"],
    ["paused", { date: "2026-09-25", status: "paused" }, "vacation"],
    ["skipped past cutoff stays failed, so it can still move", { date: "2026-09-22", status: "skipped", locked: true }, "failed"],
    ["merged source", { date: "2026-09-25", status: "skipped", combinedInto: "2026-09-28" }, "combined-into"],
    ["make-up stays upcoming", { date: "2026-09-25", isMakeup: true }, "upcoming"],
  ];
  it.each(rows)("%s", (_n, d, status) => expect(one(d).status).toBe(status));

  it("cutoff is 18:00 the day before, in the plan timezone", () => {
    expect(one({ date: "2026-09-23" }).cutoffAt).toBe(Date.UTC(2026, 8, 22, 22, 0));
    expect(one({ date: "2026-11-02" }).cutoffAt).toBe(Date.UTC(2026, 10, 1, 23, 0)); // EST after DST ends
  });
  it("snapshotted cutoffAt wins over derivation", () => {
    expect(one({ date: "2026-09-23", cutoffAt: 123 }).cutoffAt).toBe(123);
  });
  it("2026-09-22 22:00Z is exactly the cutoff instant: locked at, open 1ms before", () => {
    const at = Date.UTC(2026, 8, 22, 22, 0);
    expect(one({ date: "2026-09-23" }, plan, at - 1).status).toBe("upcoming");
    expect(one({ date: "2026-09-23" }, plan, at).status).toBe("cutoff-passed");
  });
  it("delivery day is judged in plan tz, not UTC", () => {
    // 2026-09-23 01:00Z is still Tue 21:00 Toronto
    expect(one({ date: "2026-09-23", locked: true }, plan, Date.UTC(2026, 8, 23, 1, 0)).status).toBe("cutoff-passed");
    expect(one({ date: "2026-09-23", locked: true }, plan, Date.UTC(2026, 8, 23, 5, 0)).status).toBe("unconfirmed");
  });
  it("units default to 1, coversDates and eating days from covers", () => {
    const t = one({ date: "2026-09-25", units: 3, covers: ["2026-09-25", "2026-09-26", "2026-09-27"], appliedSwaps: { "2026-09-26": [{ label: "1 Rice → 4 Roti" }] }, mealsByDate: { "2026-09-25": [{ label: "Curry", picks: [{ name: "Aloo Gobi" }], quantity: 1 }] } });
    expect(t.units).toBe(3);
    expect(t.coversDates).toHaveLength(3);
    expect(t.eatingDays.map((e) => e.date)).toEqual(t.coversDates);
    expect(t.eatingDays[0]!.dishSummary).toBe("Aloo Gobi");
    expect(t.eatingDays[1]!.dishSummary).toBeNull();
    expect(t.eatingDays[1]!.swaps).toEqual(["1 Rice → 4 Roti"]);
    expect(t.eatingDays[1]!.locksWith).toBe("2026-09-25");
    expect(t.eatingDays[0]!.locksWith).toBeNull();
    expect(t.coversLabel).toBe("Covers Fri + Sat + Sun");
    expect(one({ date: "2026-09-23" }).units).toBe(1);
  });
  it("carries a re-addressed delivery's own address; inheriting ones have none", () => {
    expect(one({ date: "2026-09-23", addressOverride: { addressLine: "200 Bay St", postalCode: "M5J 2J1" } }).addressOverride)
      .toEqual({ addressLine: "200 Bay St", postalCode: "M5J 2J1" });
    expect(one({ date: "2026-09-23" }).addressOverride).toBeNull();
  });
  it("sorts by date and keeps mergedInto", () => {
    const ts = buildTrips([day({ date: "2026-09-28", status: "skipped", combinedInto: "2026-09-30" }), day({ date: "2026-09-23" })], NOW, plan);
    expect(ts.map((t) => t.date)).toEqual(["2026-09-23", "2026-09-28"]);
    expect(ts[1]!.mergedInto).toBe("2026-09-30");
  });
});

type Case = [string, Partial<CalendarDayInput> & { date: string }, Partial<Record<TripAction, boolean>>];
const off = { pick: false, swap: false, move: false, address: false };
const cases: Case[] = [
  ["upcoming", { date: "2026-09-23" }, { pick: true, swap: true, move: true, address: true }],
  ["make-up upcoming (a moved tiffin can't move again)", { date: "2026-09-25", isMakeup: true }, { pick: true, swap: true, move: false, address: true }],
  ["failed drop", { date: "2026-09-25", status: "skipped" }, { pick: false, swap: false, move: true, address: false }],
  ["failed drop past its cutoff is still movable", { date: "2026-09-22", status: "skipped", locked: true }, { pick: false, swap: false, move: true, address: false }],
  ["moved away (make-up)", { date: "2026-09-25", status: "skipped", rescheduled: true }, off],
  ["legacy paused", { date: "2026-09-25", status: "paused" }, { pick: false, swap: false, move: true, address: false }],
  ["combined-into", { date: "2026-09-25", status: "skipped", combinedInto: "2026-09-28" }, off],
  ["delivered", { date: "2026-09-21", locked: true }, off],
  ["cutoff-passed", { date: "2026-09-22", locked: true }, off],
];
describe("actionAvailability ok matrix", () => {
  it.each(cases)("%s", (_n, d, expected) => {
    const av = actionAvailability(one(d), NOW, plan);
    expect(Object.keys(av).sort()).toEqual([...ACTIONS].sort());
    for (const [k, ok] of Object.entries(expected)) expect(av[k as TripAction].ok, k).toBe(ok);
    for (const a of ACTIONS) {
      const x = av[a];
      if (!x.ok) expect(x.why, `${a} needs a reason`).toBeTruthy();
      if (x.ok) expect(x.why).toBeNull();
      expect(typeof x.sub).toBe("string");
    }
  });
});

describe("actionAvailability copy", () => {
  it("upcoming: sublabels state what and when", () => {
    const a = actionAvailability(one({ date: "2026-09-23" }), NOW, plan);
    expect(a.pick.sub).toBe("Closes Tue 6:00 pm");
    expect(a.move.sub).toBe("Pick a new delivery day");
    expect(a.address.sub).toBe("Closes Tue 6:00 pm");
  });
  it("cutoff-passed uses closed copy", () => {
    const a = actionAvailability(one({ date: "2026-09-22", locked: true }), NOW, plan);
    expect(a.pick.why).toBe("Changes closed Mon 6:00 pm. This trip is being prepared.");
    expect(a.move.why).toBe("Changes closed Mon 6:00 pm. This trip is being prepared.");
  });
  it("delivered copy", () => {
    const a = actionAvailability(one({ date: "2026-09-21", locked: true, optimoCompletionStatus: "success" }), NOW, plan);
    expect(a.pick.why).toBe("Delivered. Changes closed Sun 6:00 pm.");
    expect(a.move.why).toBe("Already delivered.");
  });
  it("failed drop: move it, nothing to edit in place", () => {
    const a = actionAvailability(one({ date: "2026-09-25", status: "skipped" }), NOW, plan);
    expect(a.move.sub).toBe("Pick a new day for this tiffin");
    expect(a.pick.why).toBe("Not delivered. Move it to another day to choose meals.");
    expect(a.swap.why).toBe("Not delivered. Move it to another day to swap items.");
  });
  it("a moved-away day can't move again", () => {
    const a = actionAvailability(one({ date: "2026-09-25", status: "skipped", rescheduled: true }), NOW, plan);
    expect(a.move.why).toBe("Already moved.");
  });
  it("combined-into points at the target", () => {
    const a = actionAvailability(one({ date: "2026-09-25", status: "skipped", combinedInto: "2026-09-28" }), NOW, plan);
    for (const k of ["pick", "swap", "move"] as const) expect(a[k].why).toBe("Combined into Mon, Sep 28. Go to that trip.");
  });
});

describe("buildDayStatusMap", () => {
  it("maps every eating day to the trip's legend key; merged source has none", () => {
    const trips = buildTrips([
      day({ date: "2026-09-25", units: 3, covers: ["2026-09-25", "2026-09-26", "2026-09-27"] }),
      day({ date: "2026-09-21", locked: true, optimoCompletionStatus: "success" }),
      day({ date: "2026-09-28", status: "skipped" }),
      day({ date: "2026-09-30", status: "paused" }),
      day({ date: "2026-10-02", status: "skipped", combinedInto: "2026-10-05" }),
    ], NOW, plan);
    const m = buildDayStatusMap(trips);
    expect(m["2026-09-26"]).toEqual({ status: "upcoming", legend: "upcoming", label: "Upcoming" });
    expect(m["2026-09-21"]!.legend).toBe("delivered");
    expect(m["2026-09-21"]!.label).toBe("Delivered");
    expect(m["2026-09-28"]!.legend).toBe("onHold");
    expect(m["2026-09-30"]!.legend).toBe("vacation");
    expect(m["2026-10-02"]!.legend).toBeNull();
    expect(m["2026-10-03"]).toBeUndefined();
  });
});
