import { describe, expect, it } from "vitest";
import { actionAvailability, buildTrips, type CalendarDayInput, type PlanContext } from "../index";
import { dotStatus, pausedAhead, type AgendaDot } from "../week";
import { actionModel } from "@/components/customer/deliveries/action-model";

const plan: PlanContext = { cutoffHour: 18, timezone: "America/Toronto", lastDeliveryDate: "2030-01-14", deliveryWeekdays: ["mon", "wed", "fri"] };
const now = Date.parse("2030-01-01T12:00:00Z");
const day = (over: Partial<CalendarDayInput>): CalendarDayInput => ({ date: "2030-01-09", status: "scheduled", locked: false, isMakeup: false, ...over });

describe("a holiday in the trip model", () => {
  it("a paused holiday row is a holiday, not a customer pause: no Resume, no actions", () => {
    const [trip] = buildTrips([day({ status: "paused", holidayName: "Diwali", movedTo: "2030-01-14", rescheduled: true })], now, plan);
    expect([trip!.status, trip!.holidayName, trip!.movedTo]).toEqual(["holiday", "Diwali", "2030-01-14"]);
    const model = actionModel(trip!, now, plan);
    expect(model.resume).toEqual({ day: false });
    expect([model.rows, model.bar, model.primary, model.goTo]).toEqual([[], [], null, "2030-01-14"]);
  });

  it("a paused customer day is still a pause", () => {
    const [trip] = buildTrips([day({ status: "paused" })], now, plan);
    expect(trip!.status).toBe("paused");
    expect(actionModel(trip!, now, plan).resume.day).toBe(true);
  });

  it("a held row that was moved and tagged after the fact is a holiday", () => {
    const [trip] = buildTrips([day({ status: "skipped", rescheduled: true, movedTo: "2030-01-14", holidayName: "Thanksgiving" })], now, plan);
    expect(trip!.status).toBe("holiday");
  });

  it("a held holiday row keeps its Move while it reads as a holiday", () => {
    const [trip] = buildTrips([day({ date: "2029-12-31", status: "skipped", cutoffAt: now - 1000, holidayName: "Thanksgiving" })], now, plan);
    expect([trip!.status, trip!.holidayName]).toEqual(["failed", "Thanksgiving"]);
    expect(actionAvailability(trip!, now, plan).move.ok).toBe(true);
    expect(actionModel(trip!, now, plan).bar).toEqual(["move"]);
  });

  it("a scheduled row is never a holiday, whatever name it carries", () => {
    const [trip] = buildTrips([day({ status: "scheduled", holidayName: "stale" })], now, plan);
    expect(trip!.status).toBe("upcoming");
  });

  it("the week dot is a holiday first, and a holiday day is not counted for Resume all", () => {
    const dot: AgendaDot = { orderId: "o", status: "paused", cutoffAt: now + 1000, deliveryDate: "2030-01-09", truck: true, units: 1, covers: ["2030-01-09"], holiday: "Diwali" };
    expect(dotStatus(dot, now)).toBe("holiday");
    expect(dotStatus({ ...dot, holiday: null }, now)).toBe("paused");
    expect(pausedAhead({ "2030-01-09": [dot] }, now)).toBe(0);
    expect(pausedAhead({ "2030-01-09": [{ ...dot, holiday: null }] }, now)).toBe(1);
  });
});
