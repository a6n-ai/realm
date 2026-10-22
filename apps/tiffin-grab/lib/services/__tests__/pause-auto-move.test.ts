import { describe, expect, it, vi } from "vitest";
import { carryTripDateIso } from "@/lib/menu/carry-trip";

vi.mock("@/db/client", () => ({ db: {} }));
const { nextEndOfPlanDate } = await import("../pause-auto-move");

const MON_FRI = new Set(["mon", "tue", "wed", "thu", "fri"]);
const trip = (days: string[]) => (eat: string) => carryTripDateIso(eat, days as never);
const FIVE = trip(["mon", "tue", "wed", "thu", "fri"]);
const MWF = trip(["mon", "wed", "fri"]);
const open = () => true;
const free = async () => false;

describe("nextEndOfPlanDate", () => {
  it("is the first eating day after the plan's last one", async () => {
    // Fri 2026-10-30 is the last day; the weekend is not an eating day.
    expect(await nextEndOfPlanDate("2026-10-30", MON_FRI, FIVE, open, free)).toBe("2026-11-02");
  });

  it("keeps to the plan's own eating days", async () => {
    expect(await nextEndOfPlanDate("2026-10-27", new Set(["mon", "wed"]), trip(["mon", "wed"]), open, free)).toBe("2026-10-28");
  });

  it("eats Mon to Fri on a Mon/Wed/Fri plan: Tue rides Monday's trip, so no new trip day appears", async () => {
    let tail = "2026-10-30";
    const got: [string, string | null][] = [];
    for (let i = 0; i < 5; i++) {
      tail = (await nextEndOfPlanDate(tail, MON_FRI, MWF, open, free))!;
      got.push([tail, MWF(tail)]);
    }
    expect(got).toEqual([
      ["2026-11-02", "2026-11-02"], ["2026-11-03", "2026-11-02"], ["2026-11-04", "2026-11-04"],
      ["2026-11-05", "2026-11-04"], ["2026-11-06", "2026-11-06"],
    ]);
  });

  it("goes past a renewal that starts right after, to the first free day after it", async () => {
    const renewal = new Set(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]);
    expect(await nextEndOfPlanDate("2026-10-30", MON_FRI, FIVE, open, async (d) => renewal.has(d))).toBe("2026-11-16");
  });

  it("uses a free day between the plan and a later renewal", async () => {
    const renewal = new Set(["2026-11-04", "2026-11-05"]);
    expect(await nextEndOfPlanDate("2026-10-30", MON_FRI, FIVE, open, async (d) => renewal.has(d))).toBe("2026-11-02");
  });

  it("skips an eating day whose carrying trip's cutoff already passed", async () => {
    // Tue rides Monday on MWF; Monday is closed, so Wed is next.
    expect(await nextEndOfPlanDate("2026-10-26", MON_FRI, MWF, (t) => t !== "2026-10-26", free)).toBe("2026-10-28");
  });

  it("gives up with null when nothing is free", async () => {
    expect(await nextEndOfPlanDate("2026-10-30", MON_FRI, FIVE, () => false, free)).toBeNull();
  });
});
