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

describe("buildWeekBoard popular per diet", () => {
  it("tags the veg and the non-veg favourite in the same row", () => {
    const both = {
      ...pub,
      items: [
        { dayOfWeek: "mon" as const, slot: "sabzi", dishName: "Aloo Gobi", position: 0, planName: "Pure Vegetarian Plan" },
        { dayOfWeek: "mon" as const, slot: "sabzi", dishName: "Palak Paneer", position: 1, planName: "Pure Vegetarian Plan" },
        { dayOfWeek: "mon" as const, slot: "sabzi", dishName: "Keema Matar", position: 2, planName: "Non-Veg Plan" },
        { dayOfWeek: "mon" as const, slot: "sabzi", dishName: "Chicken Curry", position: 3, planName: "Non-Veg Plan" },
      ],
    };
    const { days } = buildWeekBoard(both, "America/Toronto", { "Keema Matar": 40, "Chicken Curry": 10, "Palak Paneer": 8, "Aloo Gobi": 3 });
    expect(days[0]!.popular).toEqual(["Palak Paneer", "Keema Matar"]);
  });
});

