import { describe, expect, it } from "vitest";
import { clubbedQuantities, planWeek, orderDeliveryDays, type DayOfWeek } from "../delivery-days";

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
