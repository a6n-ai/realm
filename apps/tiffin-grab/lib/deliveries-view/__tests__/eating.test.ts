import { describe, expect, it } from "vitest";
import { buildEatingDays, deliveryLine } from "../eating";
import type { Trip } from "../index";

const day = (date: string, dish: string | null = null, locksWith: string | null = null) => ({ date, dishSummary: dish, swaps: [], locksWith });
const trip = (o: Partial<Trip>): Trip => ({
  orderId: "o", date: "2026-09-21", deliveryId: "a", units: 2, coversDates: ["2026-09-21", "2026-09-22"], coversLabel: "Covers Mon + Tue",
  eatingDays: [day("2026-09-21", "Dal"), day("2026-09-22", "Kadhi", "2026-09-21")], status: "upcoming", cutoffAt: 0, mergedInto: null, isMakeup: false, pooled: false, rescheduled: false, ...o,
});

describe("buildEatingDays", () => {
  it("a Mon trip covering Mon+Tue yields two eating days, only Mon is the delivery day", () => {
    const rows = buildEatingDays([trip({})]);
    expect(rows.map((r) => [r.date, r.own])).toEqual([["2026-09-21", true], ["2026-09-22", false]]);
    expect(rows[1]!.dish).toBe("Kadhi");
  });
  it("merged-source trips add no rows (their day lives in the target's covers)", () => {
    const rows = buildEatingDays([trip({ date: "2026-09-21", status: "combined-into", mergedInto: "2026-09-22", eatingDays: [] }), trip({ date: "2026-09-22", coversDates: ["2026-09-21", "2026-09-22"] })]);
    expect(rows).toHaveLength(2);
  });
  it("two plans on the same day both appear, in date order", () => {
    const rows = buildEatingDays([trip({ orderId: "a" }), trip({ orderId: "b", coversDates: ["2026-09-21"], eatingDays: [day("2026-09-21", "Chole")] })]);
    expect(rows.filter((r) => r.date === "2026-09-21").map((r) => r.orderId).sort()).toEqual(["a", "b"]);
  });
});

describe("prod shape: plan eating Mon/Tue/Fri/Sat/Sun", () => {
  it("Mon trip feeds Mon+Tue, Fri trip feeds Fri+Sat+Sun; carried days say which truck", () => {
    const fri = trip({ date: "2026-09-25", coversDates: ["2026-09-25", "2026-09-26", "2026-09-27"], units: 3, eatingDays: [day("2026-09-25"), day("2026-09-26", null, "2026-09-25"), day("2026-09-27", null, "2026-09-25")] });
    const rows = buildEatingDays([trip({}), fri]);
    expect(rows.map((r) => r.date)).toEqual(["2026-09-21", "2026-09-22", "2026-09-25", "2026-09-26", "2026-09-27"]);
    expect(rows.filter((r) => r.own).map((r) => r.date)).toEqual(["2026-09-21", "2026-09-25"]);
    expect(deliveryLine(rows[4]!)).toBe("Arrives Fri, Sep 25 with Fri");
  });
});

describe("deliveryLine", () => {
  it("names the truck day and 'with' for carried days", () => {
    const [mon, tue] = buildEatingDays([trip({})]);
    expect(deliveryLine(mon!)).toBe("Arrives Mon, Sep 21");
    expect(deliveryLine(tue!)).toBe("Arrives Mon, Sep 21 with Mon");
    const [d] = buildEatingDays([trip({ status: "delivered" })]);
    expect(deliveryLine(d!)).toBe("Delivered Mon, Sep 21");
  });
});
