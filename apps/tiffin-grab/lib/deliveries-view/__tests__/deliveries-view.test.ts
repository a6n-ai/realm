import { describe, expect, it } from "vitest";
import { actionAvailability, buildDayStatusMap, buildTrips, type CalendarDayInput, type PlanContext, type TripAction } from "../index";

// Mon 2026-09-21 12:00 America/Toronto (EDT, UTC-4)
const NOW = Date.UTC(2026, 8, 21, 16, 0);
const plan: PlanContext = { cutoffHour: 18, timezone: "America/Toronto", pooled: 0, lastDeliveryDate: "2026-10-02", deliveryWeekdays: ["mon", "wed", "fri"] };

const day = (o: Partial<CalendarDayInput> & { date: string }): CalendarDayInput => ({
  status: "scheduled", locked: false, isMakeup: false, menuWeekId: null, meal: null, options: [], ...o,
});
const one = (o: Partial<CalendarDayInput> & { date: string }, p: PlanContext = plan, now = NOW) => buildTrips([day(o)], now, p)[0]!;
const ACTIONS: TripAction[] = ["pick", "swap", "hold", "resume", "move", "vacation", "makeup", "pool", "address"];
const CLOSED = "Changes closed Tue 6:00 pm. This trip is being prepared.";

describe("buildTrips status", () => {
  const rows: [string, Partial<CalendarDayInput> & { date: string }, string][] = [
    ["future scheduled", { date: "2026-09-23" }, "upcoming"],
    ["cutoff passed, delivery day not reached", { date: "2026-09-22", locked: true }, "cutoff-passed"],
    ["cutoff passed via clock only", { date: "2026-09-22", cutoffAt: NOW - 1 }, "cutoff-passed"],
    ["delivered today", { date: "2026-09-21", locked: true }, "delivered"],
    ["skipped", { date: "2026-09-25", status: "skipped" }, "hold"],
    ["skipped, rescheduled", { date: "2026-09-25", status: "skipped", rescheduled: true }, "rescheduled"],
    ["paused", { date: "2026-09-25", status: "paused" }, "vacation"],
    ["skipped past cutoff", { date: "2026-09-22", status: "skipped", locked: true }, "locked"],
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
    expect(one({ date: "2026-09-23", locked: true }, plan, Date.UTC(2026, 8, 23, 5, 0)).status).toBe("delivered");
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
  it("sorts by date and keeps mergedInto", () => {
    const ts = buildTrips([day({ date: "2026-09-28", status: "skipped", combinedInto: "2026-09-30" }), day({ date: "2026-09-23" })], NOW, plan);
    expect(ts.map((t) => t.date)).toEqual(["2026-09-23", "2026-09-28"]);
    expect(ts[1]!.mergedInto).toBe("2026-09-30");
  });
});

type Case = [string, Partial<CalendarDayInput> & { date: string }, Partial<Record<TripAction, boolean>>];
const off = { pick: false, swap: false, hold: false, resume: false, move: false, address: false };
const cases: Case[] = [
  ["upcoming", { date: "2026-09-23" }, { pick: true, swap: true, hold: true, resume: false, move: true, address: true }],
  ["make-up upcoming (hold not allowed on make-ups)", { date: "2026-09-25", isMakeup: true }, { pick: true, swap: true, hold: false, resume: false, move: false, address: true }],
  ["hold", { date: "2026-09-25", status: "skipped" }, { pick: false, swap: false, hold: false, resume: true, move: true, address: false }],
  ["hold pooled", { date: "2026-09-25", status: "skipped", pooled: true }, { pick: false, swap: false, hold: false, resume: false, move: true, pool: true }],
  ["hold rescheduled", { date: "2026-09-25", status: "skipped", rescheduled: true }, { pick: false, swap: false, hold: false, resume: false, move: false }],
  ["vacation", { date: "2026-09-25", status: "paused" }, { pick: false, swap: false, hold: false, resume: false, move: true, address: false }],
  ["combined-into", { date: "2026-09-25", status: "skipped", combinedInto: "2026-09-28" }, off],
  ["delivered", { date: "2026-09-21", locked: true }, off],
  ["cutoff-passed", { date: "2026-09-22", locked: true }, off],
  ["locked hold", { date: "2026-09-22", status: "skipped", locked: true }, { ...off, pool: true }],
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
    expect(a.hold.sub).toBe("Adds 1 hold day back to your plan");
    expect(a.move.sub).toBe("Pick a new delivery day");
    expect(a.address.sub).toBe("Closes Tue 6:00 pm");
  });
  it("cutoff-passed uses closed copy", () => {
    const a = actionAvailability(one({ date: "2026-09-22", locked: true }), NOW, plan);
    expect(a.pick.why).toBe("Changes closed Mon 6:00 pm. This trip is being prepared.");
    expect(a.hold.why).toBe("Changes closed Mon 6:00 pm. This trip is being prepared.");
    expect(a.address.why).toBe("Changes closed Mon 6:00 pm. This trip is being prepared.");
  });
  it("delivered copy", () => {
    const a = actionAvailability(one({ date: "2026-09-21", locked: true }), NOW, plan);
    expect(a.pick.why).toBe("Delivered. Changes closed Sun 6:00 pm.");
    expect(a.hold.why).toBe("Already delivered.");
  });
  it("held: resume and move copy", () => {
    const a = actionAvailability(one({ date: "2026-09-25", status: "skipped" }), NOW, plan);
    expect(a.resume.sub).toBe("Put it back on the schedule. The hold day is returned.");
    expect(a.move.sub).toBe("Uses one of your hold days");
    expect(a.pick.why).toBe("On hold. Resume it to choose meals.");
    expect(a.swap.why).toBe("On hold. Resume it to swap items.");
  });
  it("pooled hold: no resume, move only after last delivery", () => {
    const a = actionAvailability(one({ date: "2026-09-25", status: "skipped", pooled: true }), NOW, plan);
    expect(a.resume.why).toBe("This hold is in your pool. Schedule it on a day instead.");
    expect(a.move.sub).toBe("Only days after Fri, Oct 2");
  });
  it("rescheduled hold cannot be unheld", () => {
    const a = actionAvailability(one({ date: "2026-09-25", status: "skipped", rescheduled: true }), NOW, plan);
    expect(a.resume.why).toBe("Already moved.");
    expect(a.move.why).toBe("Already moved.");
  });
  it("vacation trips", () => {
    const a = actionAvailability(one({ date: "2026-09-25", status: "paused" }), NOW, plan);
    expect(a.hold.why).toBe("On vacation. Resume deliveries first.");
    expect(a.pick.why).toBe("On vacation. Resume deliveries first.");
    expect(a.resume.why).toBe("On vacation. Resume deliveries first.");
  });
  it("combined-into points at the target", () => {
    const a = actionAvailability(one({ date: "2026-09-25", status: "skipped", combinedInto: "2026-09-28" }), NOW, plan);
    for (const k of ["pick", "swap", "hold", "resume", "move"] as const) expect(a[k].why).toBe("Combined into Mon, Sep 28. Go to that trip.");
  });
  it("hold on a carried trip mentions coverage in sub", () => {
    const a = actionAvailability(one({ date: "2026-09-25", units: 3, covers: ["2026-09-25", "2026-09-26", "2026-09-27"] }), NOW, plan);
    expect(a.hold.sub).toBe("Adds 1 hold day back to your plan");
  });
});

describe("plan-level actions", () => {
  const t = () => one({ date: "2026-09-23" });
  it("vacation is available even when today's cutoff has passed", () => {
    const late = Date.UTC(2026, 8, 22, 23, 0);
    const a = actionAvailability(one({ date: "2026-09-23" }, plan, late), late, plan);
    expect(a.vacation.ok).toBe(true);
    expect(a.vacation.sub).toBe("Start today or any day after");
  });
  it("on vacation the slot becomes resume", () => {
    const a = actionAvailability(t(), NOW, { ...plan, onVacation: true });
    expect(a.vacation).toEqual({ ok: true, why: null, sub: "Resume deliveries" });
  });
  it("no vacation stretches left", () => {
    const a = actionAvailability(t(), NOW, { ...plan, vacationsLeft: 0 });
    expect(a.vacation.ok).toBe(false);
    expect(a.vacation.why).toBe("You've used all your vacation stretches");
  });
  it("inactive plan", () => {
    const a = actionAvailability(t(), NOW, { ...plan, active: false });
    expect(a.vacation.ok).toBe(false);
    expect(a.vacation.why).toBe("No plan running.");
  });
  it("makeup counts tiffins, only after the last delivery on plan weekdays", () => {
    const a = actionAvailability(t(), NOW, { ...plan, pooled: 3 });
    expect(a.makeup).toEqual({ ok: true, why: null, sub: "3 tiffins waiting. Pick a day after Fri, Oct 2 (Mon, Wed, Fri)." });
    expect(actionAvailability(t(), NOW, { ...plan, pooled: 1 }).makeup.sub).toMatch(/^1 tiffin waiting\./);
    const none = actionAvailability(t(), NOW, plan).makeup;
    expect(none.ok).toBe(false);
    expect(none.why).toBe("No tiffins waiting in your pool.");
  });
  it("pool is only about this trip's miss", () => {
    expect(actionAvailability(t(), NOW, plan).pool.ok).toBe(false);
  });
});

describe("buildDayStatusMap", () => {
  it("maps every eating day to the trip's legend key; merged source has none", () => {
    const trips = buildTrips([
      day({ date: "2026-09-25", units: 3, covers: ["2026-09-25", "2026-09-26", "2026-09-27"] }),
      day({ date: "2026-09-21", locked: true }),
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
