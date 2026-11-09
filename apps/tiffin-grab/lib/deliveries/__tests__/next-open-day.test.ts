import { describe, expect, it } from "vitest";
import { nextOpenPlanDay, openPlanDays, planDaysAfter } from "../next-open-day";

const MWF = new Set(["mon", "wed", "fri"]);
// 2030-01-07 is a Monday.
const never = () => true;

describe("planDaysAfter", () => {
  it("lists plan weekdays strictly after the date, within the calendar cap", () => {
    expect([...planDaysAfter("2030-01-07", MWF, 7)]).toEqual(["2030-01-09", "2030-01-11", "2030-01-14"]);
  });
  it("yields nothing for an empty set", () => {
    expect([...planDaysAfter("2030-01-07", new Set())]).toEqual([]);
  });
});

describe("nextOpenPlanDay: each search keeps its own limit", () => {
  it("skips rejected days", async () => {
    expect(await nextOpenPlanDay("2030-01-07", { days: MWF, skip: (d) => d === "2030-01-09" })).toBe("2030-01-11");
  });
  it("calendar cap (client planEndDate 7, plan end 400): null when nothing fits in the days scanned", async () => {
    expect(await nextOpenPlanDay("2030-01-07", { days: new Set(["mon"]), maxCalendarDays: 6 })).toBeNull();
    expect(await nextOpenPlanDay("2030-01-07", { days: new Set(["mon"]), maxCalendarDays: 7 })).toBe("2030-01-14");
  });
  it("plan-day cap (redelivery 30, free days 120): null once that many were tried", async () => {
    const seen: string[] = [];
    const skip = (d: string) => (seen.push(d), true);
    expect(await nextOpenPlanDay("2030-01-07", { days: MWF, maxPlanDays: 4, skip })).toBeNull();
    expect(seen).toHaveLength(4);
  });
  it("exhausted: last (missed-delivery shift) answers the last day tried even when it is rejected", async () => {
    expect(await nextOpenPlanDay("2030-01-07", { days: MWF, maxPlanDays: 3, skip: never, exhausted: "last" })).toBe("2030-01-14");
    expect(await nextOpenPlanDay("2030-01-07", { days: MWF, maxPlanDays: 3, skip: never })).toBeNull();
  });
});

describe("openPlanDays", () => {
  it("collects count days; the plan-day cap counts taken days too", async () => {
    const taken = new Set(["2030-01-09"]);
    const skip = (d: string) => taken.has(d);
    expect((await openPlanDays("2030-01-07", 2, { days: MWF, skip })).found).toEqual(["2030-01-11", "2030-01-14"]);
    expect((await openPlanDays("2030-01-07", 2, { days: MWF, skip, maxPlanDays: 2 })).found).toEqual(["2030-01-11"]);
  });
});
