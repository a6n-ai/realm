import { buildTrips } from "@/lib/deliveries-view";
import { describe, expect, it } from "vitest";
import { buildPlanContext, pickDefaultTrip, renewDays, toCalendarInputs } from "../adapter";

const counts = { total: 20, delivered: 4, remaining: 16, pooled: 2, holdDays: 1, persons: 1, lastDeliveryDate: "2026-10-02", deliveryWeekdays: ["mon", "wed", "fri"] };
const day = (date: string, o: Record<string, unknown> = {}) => ({
  date, status: "scheduled" as const, locked: false, isMakeup: false, menuWeekId: null, meal: null, options: [],
  units: 1, covers: [date], coversLabel: null, combinedInto: null, eatingDays: [{ date, appliedSwaps: [], swapPairs: [] }], ...o,
});
const row = (publicId: string, deliveryDate: string, o: Record<string, unknown> = {}) => ({ publicId, id: BigInt(publicId.length), deliveryDate, cutoffAt: 1_000, pooledAt: null, ...o });

describe("toCalendarInputs", () => {
  it("joins delivery rows by date: id, cutoff, pooled, rescheduled (has make-up)", () => {
    const out = toCalendarInputs({
      days: [day("2026-09-23"), day("2026-09-25", { status: "skipped" })],
      rows: [row("a", "2026-09-23"), row("b", "2026-09-25", { pooledAt: 5, id: 7n })],
      makeupSources: new Set(["7"]),
      categoryLabels: {},
    });
    expect(out[0]).toMatchObject({ deliveryId: "a", cutoffAt: 1_000, pooled: false, rescheduled: false });
    expect(out[1]).toMatchObject({ deliveryId: "b", pooled: true, rescheduled: true });
  });
  it("maps meals by date and labelled swaps per eating day", () => {
    const meal = [{ label: "Curry", picks: [{ name: "Paneer" }], quantity: 1 }];
    const out = toCalendarInputs({
      days: [
        day("2026-09-25", { covers: ["2026-09-25", "2026-09-26"], eatingDays: [
          { date: "2026-09-25", appliedSwaps: [], swapPairs: [] },
          { date: "2026-09-26", appliedSwaps: [{ publicId: "s", fromCategory: "rice", toCategory: "roti", qtyFrom: 1, qtyTo: 4 }], swapPairs: [] },
        ] }),
        day("2026-09-26", { meal, combinedInto: "2026-09-25" }),
      ],
      rows: [row("a", "2026-09-25"), row("b", "2026-09-26")],
      makeupSources: new Set(),
      categoryLabels: { rice: "Rice", roti: "Roti" },
    });
    expect(out[0]!.mealsByDate!["2026-09-26"]).toBe(meal);
    expect(out[0]!.appliedSwaps!["2026-09-26"]).toEqual([{ label: "1 Rice → 4 Roti" }]);
  });
});

describe("plan context", () => {
  const sub = { status: "paused" } as never;
  it("derives vacation flags and pause budget", () => {
    const ctx = buildPlanContext({ sub, counts, cutoffHour: 18, timezone: "America/Toronto", pause: { limits: { maxPauses: 3 }, usage: { count: 3, daysUsed: 0 } } as never });
    expect(ctx).toMatchObject({ onVacation: true, vacationsLeft: 0, pooled: 2, lastDeliveryDate: "2026-10-02", active: true });
  });
  it("renew countdown counts days from today to the last tiffin", () => {
    expect(renewDays("2026-10-02", "2026-09-21")).toBe(11);
    expect(renewDays(null, "2026-09-21")).toBeNull();
    expect(renewDays("2026-09-01", "2026-09-21")).toBe(0);
  });
});

describe("pickDefaultTrip", () => {
  const ctx = { cutoffHour: 18, timezone: "UTC", pooled: 0, lastDeliveryDate: null, deliveryWeekdays: [] };
  const trips = buildTrips([day("2026-09-21", { locked: true }), day("2026-09-23"), day("2026-09-25")].map((d) => ({ ...d, cutoffAt: d.date === "2026-09-21" ? 1 : Date.now() + 9e9 })), Date.now(), ctx);
  it("honours ?trip when it exists", () => expect(pickDefaultTrip(trips, "2026-09-25")).toBe("2026-09-25"));
  it("falls back to the next upcoming trip", () => expect(pickDefaultTrip(trips, "1999-01-01")).toBe("2026-09-23"));
  it("empty is null", () => expect(pickDefaultTrip([], undefined)).toBeNull());
});
