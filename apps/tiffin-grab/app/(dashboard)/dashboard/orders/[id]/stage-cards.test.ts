import { describe, expect, it } from "vitest";
import { stageCards, type StageInput } from "./stage-cards";

const base: StageInput = {
  displayStatus: "active", statusLabel: "Active", status: "active", frequencyName: "5 days",
  fullyPaused: false, notStarted: false, today: "2026-10-16", startDate: "2026-10-05", createdOn: "2026-10-01",
  meal: "Veg · Large", zoneName: "Toronto", tiffinCount: 20, complimentaryTiffins: 0, persons: 1,
  counts: { total: 20, delivered: 8, remaining: 12 }, next: { date: "2026-10-19", driver: "Raj" },
  lastTiffin: "2026-10-30", unconfirmed: { units: 0, dates: [] }, renewal: null,
  holds: { daysUsed: 2, maxDays: 5 }, money: { paid: 200, total: 200, due: 0, refunded: 0, toReview: 0 },
  cancelledOn: null, fmt: (n) => `$${n}`, day: (d) => d,
};
const labels = (i: Partial<StageInput>) => stageCards({ ...base, ...i }).map((c) => c.label);
const card = (i: Partial<StageInput>, label: string) => stageCards({ ...base, ...i }).find((c) => c.label === label);

describe("order stage cards", () => {
  it("every stage shows five cards", () => {
    for (const i of [{}, { notStarted: true }, { status: "pending" }, { status: "waitlisted" }, { status: "completed" },
      { status: "completed", unconfirmed: { units: 1, dates: ["2026-10-15"] } }, { status: "cancelled" }]) {
      expect(labels(i)).toHaveLength(5);
    }
  });

  it("running: tiffins left, next drop, hold days, end date", () => {
    expect(labels({})).toEqual(["Status", "Tiffins left", "Next delivery", "Hold days", "Ends"]);
    expect(card({}, "Tiffins left")?.value).toBe("12 / 20");
    expect(card({}, "Hold days")?.value).toBe("2 / 5");
  });

  it("ending within two days swaps the end date for renewal, red until booked", () => {
    expect(card({ lastTiffin: "2026-10-17" }, "Renewed")).toMatchObject({ value: "Not yet", tone: "bad" });
    expect(card({ lastTiffin: "2026-10-17", renewal: { deploymentId: "SUB-1", startDate: "2026-10-19" } }, "Renewed")).toMatchObject({ value: "Yes", tone: "ok" });
  });

  it("unpaid or not started leads with the balance and start date", () => {
    expect(labels({ status: "pending", displayStatus: "payment_review" })).toEqual(["Status", "Tiffins left", "Balance due", "Starts", "Ends"]);
    expect(card({ status: "pending", money: { ...base.money, paid: 0, due: 200 } }, "Balance due")?.tone).toBe("bad");
    expect(card({ notStarted: true, counts: null, complimentaryTiffins: 2 }, "Tiffins left")?.value).toBe("22 / 22");
  });

  it("cancelled shows what was delivered, never tiffins left", () => {
    const cards = labels({ status: "cancelled", cancelledOn: "2026-10-10" });
    expect(cards).not.toContain("Tiffins left");
    expect(card({ status: "cancelled" }, "Delivered")?.value).toBe("8 / 20");
  });

  it("finished with unconfirmed days flags them", () => {
    expect(labels({ status: "completed" })).toEqual(["Status", "Delivered", "Last tiffin", "Renewed", "Balance due"]);
    expect(card({ status: "completed", unconfirmed: { units: 2, dates: ["2026-10-14", "2026-10-15"] } }, "Not confirmed")).toMatchObject({ value: "2 / 20", tone: "bad" });
  });

  it("waitlisted shows how long it has waited", () => {
    expect(card({ status: "waitlisted", displayStatus: "waitlisted" }, "Waiting since")?.hint).toBe("15 days on the waitlist");
  });
});
