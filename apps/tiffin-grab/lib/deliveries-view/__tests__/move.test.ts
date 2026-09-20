import { describe, expect, it } from "vitest";
import { moveOptions } from "../move";
import type { PlanContext, Trip } from "../index";

const NOW = Date.parse("2026-09-21T12:00:00Z");
const ctx: PlanContext = { cutoffHour: 18, timezone: "UTC", pooled: 0, lastDeliveryDate: "2026-10-02", deliveryWeekdays: ["mon", "wed", "fri"] };
const trip = { date: "2026-09-23", units: 1, coversDates: ["2026-09-23"], pooled: false } as Trip;

describe("moveOptions", () => {
  it("offers plan weekdays only, flags source, closed, held and merge days", () => {
    const o = moveOptions(trip, [
      { date: "2026-09-25", status: "scheduled", units: 3, covers: ["2026-09-24", "2026-09-25"] },
      { date: "2026-09-28", status: "skipped" },
    ], NOW, ctx, "2026-09-21");
    expect(o.map((x) => x.date).slice(0, 5)).toEqual(["2026-09-21", "2026-09-23", "2026-09-25", "2026-09-28", "2026-09-30"]);
    expect(o[0]!.disabledReason).toMatch(/closed/);
    expect(o[1]!.disabledReason).toMatch(/moving from/);
    expect(o[2]).toMatchObject({ disabledReason: undefined, merge: { units: 4, covers: ["2026-09-23", "2026-09-24", "2026-09-25"] } });
    expect(o[3]!.disabledReason).toMatch(/held/);
  });
  it("pooled trip may only go after the last delivery to an open day", () => {
    const o = moveOptions({ ...trip, pooled: true }, [], NOW, ctx, "2026-09-30", 10);
    expect(o.find((x) => x.date === "2026-09-30")!.disabledReason).toMatch(/after Fri, Oct 2/);
    expect(o.find((x) => x.date === "2026-10-05")!.disabledReason).toBeUndefined();
  });
});
