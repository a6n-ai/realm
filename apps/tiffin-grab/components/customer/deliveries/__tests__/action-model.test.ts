import { describe, expect, it } from "vitest";
import { actionModel } from "../action-model";
import type { Trip } from "@/lib/deliveries-view";

const ctx = { cutoffHour: 18, timezone: "UTC", pooled: 0, lastDeliveryDate: null, deliveryWeekdays: ["mon"], active: true };
const trip = (o: Partial<Trip> = {}): Trip => ({ orderId: "o", date: "2026-09-23", deliveryId: "a", units: 1, coversDates: ["2026-09-23"], coversLabel: null, eatingDays: [], status: "upcoming", cutoffAt: Date.now() + 9e9, mergedInto: null, isMakeup: false, pooled: false, rescheduled: false, ...o });

describe("actionModel", () => {
  it("upcoming: pick is primary, rows are pick/move (swap embedded in Edit meal)", () => {
    const m = actionModel(trip(), Date.now(), ctx);
    expect(m.primary).toBe("pick");
    expect(m.rows.map((r) => r.key)).toEqual(["pick", "move"]);
    expect(m.rows.every((r) => r.av.ok)).toBe(true);
    expect(m.bar).toEqual(["pick", "move"]);
    expect(m.rows.find((r) => r.key === "pick")?.label).toBe("Edit meal");
  });
  it("on hold: resume is offered and becomes primary", () => {
    const m = actionModel(trip({ status: "hold" }), Date.now(), ctx);
    expect(m.primary).toBe("resume");
    expect(m.rows.map((r) => r.key)).toEqual(["pick", "resume", "move"]);
    expect(m.bar).toEqual(["pick", "move"]);
  });
  it("delivered: no rows, reason instead", () => {
    const m = actionModel(trip({ status: "delivered" }), Date.now(), ctx);
    expect(m.primary).toBeNull();
    expect(m.rows).toEqual([]);
    expect(m.closedReason).toMatch(/Delivered/);
  });
  it("combined: reason points to the target", () => {
    const m = actionModel(trip({ status: "combined-into", mergedInto: "2026-09-25" }), Date.now(), ctx);
    expect(m.closedReason).toMatch(/Combined into Fri, Sep 25/);
    expect(m.goTo).toBe("2026-09-25");
  });
  it("on vacation: primary is resuming deliveries", () => {
    const m = actionModel(trip({ status: "vacation" }), Date.now(), { ...ctx, onVacation: true });
    expect(m.primary).toBe("vacation");
  });
  it("payment locked: only meal picking remains, no bar", () => {
    const m = actionModel(trip(), Date.now(), ctx, { locked: true });
    expect(m.rows.map((r) => r.key)).toEqual(["pick"]);
    expect(m.bar).toEqual([]);
    expect(m.primary).toBe("pick");
  });
  it("payment locked: a held trip cannot be resumed", () => {
    const m = actionModel(trip({ status: "hold" }), Date.now(), ctx, { locked: true });
    expect(m.rows.map((r) => r.key)).toEqual(["pick"]);
    expect(m.primary).toBeNull();
  });
});
