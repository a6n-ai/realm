import { describe, expect, it } from "vitest";
import { actionModel } from "../action-model";
import type { Trip } from "@/lib/deliveries-view";

const ctx = { cutoffHour: 18, timezone: "UTC", lastDeliveryDate: null, deliveryWeekdays: ["mon"], active: true };
const trip = (o: Partial<Trip> = {}): Trip => ({ orderId: "o", date: "2026-09-23", deliveryId: "a", units: 1, coversDates: ["2026-09-23"], coversLabel: null, eatingDays: [], status: "upcoming", cutoffAt: Date.now() + 9e9, mergedInto: null, isMakeup: false, rescheduled: false, ...o });

describe("actionModel", () => {
  it("upcoming: pick is primary, rows are pick/move/address (swap embedded in Edit meal)", () => {
    const m = actionModel(trip(), Date.now(), ctx);
    expect(m.primary).toBe("pick");
    expect(m.rows.map((r) => r.key)).toEqual(["pick", "move", "address"]);
    expect(m.rows.every((r) => r.av.ok)).toBe(true);
    expect(m.bar).toEqual(["pick", "move"]);
    expect(m.rows.find((r) => r.key === "pick")?.label).toBe("Edit meal");
  });
  it("a moved-away day on a live trip: no edits, only a way to where its tiffin is eaten now", () => {
    const m = actionModel(trip(), Date.now(), ctx, { movedTo: "2026-09-29" });
    expect([m.primary, m.rows, m.bar, m.goTo, m.closedReason]).toEqual([null, [], [], "2026-09-29", null]);
  });
  it("failed drop: Move is the only action and the primary", () => {
    const m = actionModel(trip({ status: "failed" }), Date.now(), ctx);
    expect(m.primary).toBe("move");
    expect(m.rows.map((r) => r.key)).toEqual(["move"]);
    expect(m.bar).toEqual(["move"]);
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
  it("payment locked: view-only, no actions and no bar (not even Edit meal)", () => {
    const m = actionModel(trip(), Date.now(), ctx, { locked: true });
    expect(m.rows).toEqual([]);
    expect(m.bar).toEqual([]);
    expect(m.primary).toBeNull();
  });
  it("payment locked: a failed trip cannot be moved", () => {
    const m = actionModel(trip({ status: "failed" }), Date.now(), ctx, { locked: true });
    expect(m.rows).toEqual([]);
    expect(m.primary).toBeNull();
  });
});
