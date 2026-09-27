import { describe, expect, it } from "vitest";
import { buildEatingDays, deliveryLine, eatingRowsInWeek, isAddressRow, movedInNote } from "../eating";
import type { Trip } from "../index";

const day = (date: string, dish: string | null = null, locksWith: string | null = null) => ({ date, dishSummary: dish, swaps: [], locksWith });
const trip = (o: Partial<Trip>): Trip => ({
  orderId: "o", date: "2026-09-21", deliveryId: "a", units: 2, coversDates: ["2026-09-21", "2026-09-22"], coversLabel: "Covers Mon + Tue",
  eatingDays: [day("2026-09-21", "Dal"), day("2026-09-22", "Kadhi", "2026-09-21")], status: "upcoming", cutoffAt: 0, mergedInto: null, isMakeup: false, rescheduled: false, ...o,
});

describe("moved days", () => {
  it("a rescheduled day reads Moved to <date> with no dish", () => {
    const rows = buildEatingDays([trip({ date: "2026-09-23", coversDates: ["2026-09-23"], eatingDays: [day("2026-09-23", "Dal")], status: "rescheduled", movedTo: "2026-09-25" })]);
    expect(rows[0]!.dish).toBeNull();
    expect(deliveryLine(rows[0]!)).toBe("Moved to Fri, Sep 25");
  });
  it("a merged source keeps a Moved row only for days its target does not carry", () => {
    const src = trip({ date: "2026-09-23", coversDates: ["2026-09-23"], eatingDays: [day("2026-09-23")], status: "combined-into", movedTo: "2026-09-25", mergedInto: "2026-09-25" });
    const tgt = trip({ date: "2026-09-25", coversDates: ["2026-09-25"], eatingDays: [day("2026-09-25")] });
    expect(buildEatingDays([src, tgt]).map((r) => [r.date, deliveryLine(r)])).toEqual([["2026-09-23", "Moved to Fri, Sep 25"], ["2026-09-25", "Arrives Fri, Sep 25"]]);
  });
});

describe("one eating day moved off a Fri+Sat+Sun trip", () => {
  // Fri's tiffin moved to Wed (same week), Sat's to next Tue. Fri's truck brings only Sun.
  const wed = trip({ date: "2026-09-23", coversDates: ["2026-09-23"], extraDates: ["2026-09-23"], units: 2, eatingDays: [day("2026-09-23", "Dal")], movesIn: [{ from: "2026-09-25", to: "2026-09-23" }] });
  const fri = trip({ date: "2026-09-25", coversDates: ["2026-09-27"], units: 1, eatingDays: [day("2026-09-27", "Kadhi", "2026-09-25")], movesOut: [{ from: "2026-09-25", to: "2026-09-23" }, { from: "2026-09-26", to: "2026-09-29" }] });
  const tue = trip({ date: "2026-09-29", coversDates: ["2026-09-29"], extraDates: ["2026-09-29"], units: 2, eatingDays: [day("2026-09-29")], movesIn: [{ from: "2026-09-26", to: "2026-09-29" }] });
  const rows = buildEatingDays([wed, fri, tue]);
  const lines = Object.fromEntries(rows.map((r) => [r.date, deliveryLine(r)]));

  it("Wed carries its own tiffin plus Fri's, both on Wed's meal", () => {
    expect(lines["2026-09-23"]).toBe("Arrives Wed, Sep 23");
    expect(movedInNote(rows.find((r) => r.date === "2026-09-23")!)).toBe("Fri's tiffin moved here, same meal");
    expect(rows.find((r) => r.date === "2026-09-23")!.dish).toBe("Dal");
  });
  it("Fri and Sat read Moved to; Sun still arrives on Friday's truck", () => {
    expect(lines["2026-09-25"]).toBe("Moved to Wed, Sep 23");
    expect(lines["2026-09-26"]).toBe("Moved to Tue, Sep 29");
    expect(lines["2026-09-27"]).toBe("Arrives Fri, Sep 25 with Fri");
  });
  it("Change address sits on the delivery day, even after its own tiffin moved away", () => {
    const fri = rows.filter((r) => r.trip.date === "2026-09-25");
    expect(fri.filter((r) => isAddressRow(rows, r)).map((r) => r.date)).toEqual(["2026-09-25"]);
  });
  it("a truck whose own day isn't an eating day offers it on its first eating day", () => {
    const sat = trip({ date: "2026-09-25", coversDates: ["2026-09-26", "2026-09-27"], eatingDays: [day("2026-09-26"), day("2026-09-27")] });
    const r = buildEatingDays([sat]);
    expect(r.filter((x) => isAddressRow(r, x)).map((x) => x.date)).toEqual(["2026-09-26"]);
  });
  it("a moved-away day shows only in its own week", () => {
    expect(eatingRowsInWeek([wed, fri, tue], "2026-09-28", "2026-10-04").map((r) => r.date)).toEqual(["2026-09-29"]);
  });
});

describe("settled days", () => {
  it("a delivered or failed day just says so, without carried-day or moved-in details", () => {
    const [own, carried] = buildEatingDays([trip({ status: "delivered", movesIn: [{ from: "2026-09-25", to: "2026-09-21" }] })]);
    expect([deliveryLine(own!), deliveryLine(carried!), movedInNote(own!)]).toEqual(["Delivered Mon, Sep 21", "Delivered Mon, Sep 21", null]);
    expect(deliveryLine(buildEatingDays([trip({ status: "failed" })])[0]!)).toBe("Delivery failed Mon, Sep 21");
  });
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

describe("eatingRowsInWeek", () => {
  it("lists a moved tiffin in the week the truck arrives, even when the eat date is the week before", () => {
    const moved = trip({
      date: "2026-09-25",
      coversDates: ["2026-09-18", "2026-09-19", "2026-09-20"],
      units: 3,
      eatingDays: [day("2026-09-18"), day("2026-09-19", null, "2026-09-25"), day("2026-09-20", null, "2026-09-25")],
      status: "upcoming",
    });
    const rows = eatingRowsInWeek([moved], "2026-09-21", "2026-09-27");
    expect(rows.map((r) => r.date)).toEqual(["2026-09-18", "2026-09-19", "2026-09-20"]);
    expect(deliveryLine(rows[0]!)).toContain("Arrives Fri, Sep 25");
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
