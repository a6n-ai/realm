import { describe, expect, it } from "vitest";
import { allowedDaysError, clubbedQuantities, planDaysError, dayAllowed, frequencyFits, onlyOnMessage, planWeek, orderDeliveryDays, weekendDaysError, type DayOfWeek } from "../delivery-days";

describe("orderDeliveryDays", () => {
  it("5_day → mon..fri", () => {
    expect(orderDeliveryDays({ frequencyKey: "5_day", includeSaturday: false, includeSunday: false }))
      .toEqual(["mon", "tue", "wed", "thu", "fri"]);
  });
  it("mwf → mon/wed/fri", () => {
    expect(orderDeliveryDays({ frequencyKey: "mwf", includeSaturday: false, includeSunday: false }))
      .toEqual(["mon", "wed", "fri"]);
  });
  it("adds weekend days", () => {
    expect(orderDeliveryDays({ frequencyKey: "5_day", includeSaturday: true, includeSunday: true }))
      .toEqual(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
  });
});

describe("clubbedQuantities", () => {
  it("the worked example: Tue/Thu/Fri", () => {
    // Tue covers Tue+Wed (2), Thu covers itself only since Fri is next (1),
    // Fri covers Fri+Sat+Sun+Mon since Tue is the next selected day (4).
    expect(clubbedQuantities(["tue", "thu", "fri"])).toEqual({ tue: 2, thu: 1, fri: 4 });
  });

  it("MWF splits the week into three even 2/2/3 spans", () => {
    // Mon covers Mon+Tue (2), Wed covers Wed+Thu (2), Fri covers Fri+Sat+Sun (3).
    expect(clubbedQuantities(["mon", "wed", "fri"])).toEqual({ mon: 2, wed: 2, fri: 3 });
  });

  it("every day selected gives 1 tiffin per day", () => {
    const all: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    const result = clubbedQuantities(all);
    for (const d of all) expect(result[d]).toBe(1);
  });

  it("a single selected day absorbs the whole week", () => {
    expect(clubbedQuantities(["wed"])).toEqual({ wed: 7 });
  });

  it("quantities always sum to 7 (one tiffin for every calendar day)", () => {
    const patterns: DayOfWeek[][] = [["mon"], ["tue", "thu"], ["mon", "wed", "fri"], ["mon", "tue", "wed", "thu", "fri"]];
    for (const p of patterns) {
      const sum = Object.values(clubbedQuantities(p)).reduce((a, b) => a + b, 0);
      expect(sum).toBe(7);
    }
  });
});

describe("planWeek", () => {
  const MWF: DayOfWeek[] = ["mon", "wed", "fri"];
  const FIVE: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri"];
  const ALL: DayOfWeek[] = [...FIVE, "sat", "sun"];
  const trips = (d: DayOfWeek[], e: DayOfWeek[]) => planWeek(d, e)?.map((t) => `${t.day}:${t.units}`);

  it("MWF carries eating days on the nearest earlier delivery", () => {
    expect(trips(MWF, FIVE)).toEqual(["mon:2", "wed:2", "fri:1"]);
    expect(trips(MWF, ["tue", "thu", "sat"])).toEqual(["mon:1", "wed:1", "fri:1"]);
    expect(trips(MWF, ALL)).toEqual(["mon:2", "wed:2", "fri:3"]);
  });
  it("skips delivery days with nothing to carry", () => {
    expect(trips(MWF, ["mon", "tue", "wed", "thu"])).toEqual(["mon:2", "wed:2"]);
    expect(trips(MWF, ["sat", "sun"])).toEqual(["fri:2"]);
  });
  it("5-day carries weekends on Friday", () => {
    expect(trips(FIVE, FIVE)).toEqual(["mon:1", "tue:1", "wed:1", "thu:1", "fri:1"]);
    expect(trips(FIVE, ALL)).toEqual(["mon:1", "tue:1", "wed:1", "thu:1", "fri:3"]);
    expect(trips(FIVE, ["mon", "wed", "sat"])).toEqual(["mon:1", "wed:1", "fri:1"]);
  });
  it("works for admin-defined 6/7-day delivery sets", () => {
    expect(trips([...FIVE, "sat"], ALL)).toEqual(["mon:1", "tue:1", "wed:1", "thu:1", "fri:1", "sat:2"]);
    expect(trips(ALL, ["mon", "wed", "fri"])).toEqual(["mon:1", "wed:1", "fri:1"]);
  });
  it("returns null when an eating day precedes the first delivery day", () => {
    expect(planWeek(["tue", "wed", "thu", "fri", "sat"], ["mon"])).toBeNull();
  });
  it("reports which eating days each trip carries", () => {
    expect(planWeek(MWF, ALL)?.map((t) => t.days)).toEqual([["mon", "tue"], ["wed", "thu"], ["fri", "sat", "sun"]]);
  });
  it("conserves tiffins", () => {
    const t = planWeek(MWF, ALL)!;
    expect(t.reduce((n, x) => n + x.units, 0)).toBe(7);
  });
});

describe("weekendDaysError", () => {
  it("blocks Sat/Sun only for a meal without a weekend dish", () => {
    expect(weekendDaysError(["mon", "sat"], false)).toMatch(/no weekend dish/);
    expect(weekendDaysError(["sun"], false)).toMatch(/no weekend dish/);
    expect(weekendDaysError(["mon", "fri"], false)).toBeNull();
    expect(weekendDaysError(["sat", "sun"], true)).toBeNull();
  });
});

describe("meal size allowed days", () => {
  const MWF = ["mon", "wed", "fri"] as const;
  it("null, empty or all seven days mean every day", () => {
    for (const allowed of [null, undefined, [], ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const]) {
      expect(allowedDaysError(["tue", "thu"], allowed)).toBeNull();
      expect(frequencyFits(["mon", "tue", "wed", "thu", "fri"], allowed)).toBe(true);
      expect(dayAllowed("tue", allowed)).toBe(true);
    }
  });
  it("rejects a day outside the set and names the allowed days", () => {
    expect(allowedDaysError(["mon", "wed"], MWF)).toBeNull();
    expect(allowedDaysError(["mon", "tue"], MWF)).toBe("This meal is only made on Mon, Wed and Fri");
    expect(onlyOnMessage(["fri", "mon"])).toBe("This meal is only made on Mon and Fri");
    expect(dayAllowed("thu", MWF)).toBe(false);
  });
  it("a frequency fits only when every delivery day is allowed", () => {
    expect(frequencyFits(["mon", "wed", "fri"], MWF)).toBe(true);
    expect(frequencyFits(["mon", "tue", "wed", "thu", "fri"], MWF)).toBe(false);
    expect(frequencyFits(null, MWF)).toBe(false);
  });
});

describe("planDaysError (createOrder and both price previews)", () => {
  const MWF = ["mon", "wed", "fri"] as const;
  const base = { servesWeekends: true, allowed: MWF, trial: false };
  it("refuses a frequency that delivers outside the allowed days", () => {
    expect(planDaysError({ ...base, eatingDays: ["mon", "wed", "fri"], frequencyWeekdays: ["mon", "tue", "wed", "thu", "fri"] })).toBe("This meal is only made on Mon, Wed and Fri");
    expect(planDaysError({ ...base, eatingDays: ["mon", "wed", "fri"], frequencyWeekdays: ["mon", "wed", "fri"] })).toBeNull();
  });
  it("refuses an eating day outside the allowed days, Sat/Sun flags included", () => {
    expect(planDaysError({ ...base, eatingDays: ["mon", "tue"], frequencyWeekdays: ["mon", "wed", "fri"] })).toMatch(/only made on/);
    expect(planDaysError({ ...base, eatingDays: ["mon"], includeSaturday: true, frequencyWeekdays: ["mon", "wed", "fri"] })).toMatch(/only made on/);
  });
  it("a trial skips the frequency fit but not its days; no frequency yet skips the fit", () => {
    expect(planDaysError({ ...base, trial: true, eatingDays: ["mon", "wed"], frequencyWeekdays: ["mon", "tue", "wed", "thu", "fri"] })).toBeNull();
    expect(planDaysError({ ...base, trial: true, eatingDays: ["tue"], frequencyWeekdays: ["mon", "tue", "wed", "thu", "fri"] })).toMatch(/only made on/);
    expect(planDaysError({ ...base, eatingDays: ["mon"] })).toBeNull();
  });
  it("the weekend-dish rule still wins first", () => {
    expect(planDaysError({ ...base, servesWeekends: false, allowed: null, eatingDays: ["sat"], frequencyWeekdays: ["mon"] })).toMatch(/weekend dish/);
  });
});
