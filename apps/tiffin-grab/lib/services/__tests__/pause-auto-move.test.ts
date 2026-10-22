import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({ db: {} }));
const { nextEndOfPlanDate } = await import("../pause-auto-move");

const MON_FRI = new Set(["mon", "tue", "wed", "thu", "fri"]);
const open = () => true;
const free = async () => false;

describe("nextEndOfPlanDate", () => {
  it("is the first plan weekday after the plan's last delivery", async () => {
    // Fri 2026-10-30 is the last delivery; the weekend is not a trip day.
    expect(await nextEndOfPlanDate("2026-10-30", MON_FRI, open, free)).toBe("2026-11-02");
  });

  it("keeps to the plan's own weekdays", async () => {
    expect(await nextEndOfPlanDate("2026-10-27", new Set(["mon", "wed"]), open, free)).toBe("2026-10-28");
  });

  it("goes past a renewal that starts right after, to the first free day after it", async () => {
    // Renewal delivers Mon Nov 2 to Fri Nov 13; no gap, so the day lands Mon Nov 16.
    const renewal = new Set(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]);
    expect(await nextEndOfPlanDate("2026-10-30", MON_FRI, open, async (d) => renewal.has(d))).toBe("2026-11-16");
  });

  it("uses a free day between the plan and a later renewal", async () => {
    const renewal = new Set(["2026-11-04", "2026-11-05"]);
    expect(await nextEndOfPlanDate("2026-10-30", MON_FRI, open, async (d) => renewal.has(d))).toBe("2026-11-02");
  });

  it("skips a day whose cutoff already passed", async () => {
    expect(await nextEndOfPlanDate("2026-10-21", MON_FRI, (d) => d !== "2026-10-22", free)).toBe("2026-10-23");
  });

  it("gives up with null when nothing is free", async () => {
    expect(await nextEndOfPlanDate("2026-10-30", MON_FRI, () => false, free)).toBeNull();
  });
});
