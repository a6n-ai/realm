import { describe, expect, it } from "vitest";
import { buildWeekBoard } from "../week-board";

const pub = {
  weekStart: "2026-10-19",
  slots: [{ key: "sabzi", label: "Sabzi" }, { key: "rice", label: "Rice" }],
  items: [
    { dayOfWeek: "mon" as const, slot: "sabzi", dishName: "Aloo Gobi (Veg)", position: 0 },
    { dayOfWeek: "mon" as const, slot: "sabzi", dishName: "Palak Paneer (Veg)", position: 1 },
    { dayOfWeek: "mon" as const, slot: "rice", dishName: "Jeera Rice", position: 0 },
  ],
};

describe("buildWeekBoard popular", () => {
  it("tags each row's clear favourite per day, never a row without a choice", () => {
    const { days } = buildWeekBoard(pub, "America/Toronto", { "Palak Paneer": 9, "Aloo Gobi": 2, "Jeera Rice": 50 });
    expect(days[0]!.popular).toEqual(["Palak Paneer"]);
  });

  it("tags nothing without pick counts", () => {
    expect(buildWeekBoard(pub, "America/Toronto").days[0]!.popular).toEqual([]);
  });
});
