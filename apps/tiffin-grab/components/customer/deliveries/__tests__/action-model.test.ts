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
  it("a moved-away delivery day on a live trip keeps its truck's Address, plus a way to where its tiffin is eaten now", () => {
    const m = actionModel(trip(), Date.now(), ctx, { movedTo: "2026-09-29" });
    expect([m.primary, m.rows.map((r) => r.key), m.bar, m.goTo, m.closedReason]).toEqual([null, ["address"], ["address"], "2026-09-29", null]);
  });
  it("a moved-away eating day that isn't the delivery day has nothing to edit", () => {
    const m = actionModel(trip(), Date.now(), ctx, { movedTo: "2026-09-29", isDeliveryDay: false });
    expect([m.rows, m.bar, m.goTo]).toEqual([[], [], "2026-09-29"]);
  });
  it("failed drop: Move is the only action and the primary", () => {
    const m = actionModel(trip({ status: "failed", optimoCompletionStatus: "failed" }), Date.now(), ctx);
    expect(m.primary).toBe("move");
    expect(m.rows.map((r) => r.key)).toEqual(["move"]);
    expect(m.bar).toEqual(["move"]);
  });
  it("any hold: the customer and an admin both get Move, there is no staff-only hold", () => {
    const held = trip({ status: "failed" });
    for (const m of [actionModel(held, Date.now(), ctx), actionModel(held, Date.now(), ctx, { trial: false })]) {
      expect([m.primary, m.rows.map((r) => r.key), m.bar, m.closedReason]).toEqual(["move", ["move"], ["move"], null]);
    }
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
  it("a paused day: Resume is the one primary and Move sits beside it", () => {
    const m = actionModel(trip({ status: "paused" }), Date.now(), ctx);
    expect([m.primary, m.rows.map((r) => r.key), m.resume.day]).toEqual([null, ["move"], true]);
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
  describe("Resume on a paused day", () => {
    const paused = trip({ status: "paused" });
    it("a future paused day offers Resume this day beside Move", () => {
      const m = actionModel(paused, Date.now(), ctx, { pausedAhead: 1 });
      expect(m.resume).toEqual({ day: true, all: false });
      expect(m.rows.map((r) => r.key)).toEqual(["move"]);
    });
    it("Resume all appears only when more than one future day is paused", () => {
      expect(actionModel(paused, Date.now(), ctx, { pausedAhead: 2 }).resume).toEqual({ day: true, all: true });
      expect(actionModel(paused, Date.now(), ctx, { pausedAhead: 0 }).resume.all).toBe(false);
    });
    it("an expired pause (lapsedPause hold): Move only, no Resume", () => {
      const m = actionModel(trip({ status: "failed", lapsedPause: true }), Date.now(), ctx, { pausedAhead: 3 });
      expect([m.resume, m.rows.map((r) => r.key), m.primary]).toEqual([{ day: false, all: false }, ["move"], "move"]);
    });
    it("an ordinary hold: Move only, no Resume", () => {
      const m = actionModel(trip({ status: "failed" }), Date.now(), ctx, { pausedAhead: 3 });
      expect([m.resume, m.rows.map((r) => r.key)]).toEqual([{ day: false, all: false }, ["move"]]);
    });
    it("a payment-locked plan offers no Resume", () => {
      expect(actionModel(paused, Date.now(), ctx, { pausedAhead: 2, locked: true }).resume).toEqual({ day: false, all: false });
    });
    it("an upcoming day has nothing to resume", () => {
      expect(actionModel(trip(), Date.now(), ctx, { pausedAhead: 2 }).resume).toEqual({ day: false, all: false });
    });
  });
});
