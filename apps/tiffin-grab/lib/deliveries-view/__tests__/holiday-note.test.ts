import { describe, expect, it } from "vitest";
import { buildTrips, type CalendarDayInput, type PlanContext } from "../index";
import { buildEatingDays, dayNote, deliveryLine } from "../eating";
import { moveOptions } from "../move";
import { moveChips, rowMeta } from "@/components/customer/deliveries/trip-parts";
import { buildPlanContext } from "@/components/customer/deliveries/adapter";

const plan: PlanContext = { cutoffHour: 18, timezone: "America/Toronto", lastDeliveryDate: "2030-01-14", deliveryWeekdays: ["mon", "wed", "fri"] };
const now = Date.parse("2030-01-01T12:00:00Z");
const day = (over: Partial<CalendarDayInput>): CalendarDayInput => ({ date: "2030-01-09", status: "scheduled", locked: false, isMakeup: false, ...over });
const rowFor = (over: Partial<CalendarDayInput>) => buildEatingDays(buildTrips([day(over)], now, plan))[0]!;

describe("the selected day's holiday note", () => {
  it("a declared holiday names the holiday and every day added for it, with no Out-to chip", () => {
    const row = rowFor({ status: "paused", holidayName: "Diwali", rescheduled: true, movedTo: "2030-01-14", holidayExtras: ["2030-01-14", "2030-01-16"] });
    expect(dayNote(row)).toEqual(["Holiday: Diwali", "Added at the end of the plan: Mon, Jan 14 and Wed, Jan 16"]);
    expect(deliveryLine(row)).toBe("Holiday: Diwali. Added at the end of the plan: Mon, Jan 14 and Wed, Jan 16");
    expect(moveChips(row)).toEqual([]);
    expect(rowMeta(row).label).toBe("Holiday");
  });

  it("a held row that was moved and tagged after the fact names the holiday and where it moved", () => {
    const row = rowFor({ date: "2026-10-12", status: "skipped", rescheduled: true, movedTo: "2026-10-28", holidayName: "Thanksgiving" });
    expect(dayNote(row)).toEqual(["Holiday: Thanksgiving", "Moved to Wed, Oct 28"]);
    expect(moveChips(row)).toEqual([]);
  });

  it("a day whose tiffin was moved earlier, before the holiday, doesn't read as moved by it", () => {
    const row = rowFor({ date: "2026-10-12", status: "skipped", rescheduled: true, movedTo: "2026-10-07", holidayName: "Thanksgiving" });
    expect(dayNote(row)).toEqual(["Holiday: Thanksgiving", "This day's tiffin was already moved to Wed, Oct 7"]);
  });

  it("a held row emptied one tiffin at a time still reads as the holiday on its old day", () => {
    const row = rowFor({ date: "2026-10-12", status: "skipped", covers: [], units: 0, movesOut: [{ from: "2026-10-12", to: "2026-10-28" }], holidayName: "Thanksgiving" });
    expect([row.date, row.movedTo]).toEqual(["2026-10-12", "2026-10-28"]);
    expect(dayNote(row)).toEqual(["Holiday: Thanksgiving", "Moved to Wed, Oct 28"]);
    expect(rowMeta(row).label).toBe("Holiday");
    expect(moveChips(row)).toEqual([]);
  });

  it("a closed day still waiting for staff says the tiffin is coming back", () => {
    expect(dayNote(rowFor({ status: "paused", holidayName: "Diwali" }))).toEqual(["Holiday: Diwali", "The kitchen is closed that day. The team will place this tiffin on a new day."]);
  });

  it("a held holiday row that still carries its tiffin says so, and never also claims it was not delivered", () => {
    const row = rowFor({ date: "2029-12-31", status: "skipped", cutoffAt: now - 1000, holidayName: "Thanksgiving" });
    expect(dayNote(row)).toEqual(["Holiday: Thanksgiving", "The kitchen was closed that day. Move this tiffin to another day, or contact us and we will place it."]);
    expect(dayNote(row, true)).toEqual(["Holiday: Thanksgiving", "The kitchen was closed that day. Place this tiffin on another day."]);
    expect(deliveryLine(row)).not.toMatch(/failed|Not delivered/);
    expect(rowMeta(row).label).toBe("Holiday");
  });

  it("a plain moved day keeps its Out-to chip and has no note", () => {
    const row = rowFor({ status: "skipped", rescheduled: true, movedTo: "2030-01-14" });
    expect(dayNote(row)).toEqual([]);
    expect(moveChips(row).map((c) => c.text)).toEqual(["Out to Mon, Jan 14"]);
  });
});

describe("the Move sheet", () => {
  it("disables a holiday date and names it", () => {
    const [trip] = buildTrips([day({ date: "2030-01-07", deliveryId: "d1" })], now, plan);
    const opts = moveOptions(trip!, [{ date: "2030-01-07", status: "scheduled" }], now, { ...plan, holidays: { "2030-01-11": "Lohri" } }, "2030-01-01", 14);
    expect(opts.find((o) => o.date === "2030-01-11")?.disabledReason).toBe("Kitchen is closed on Fri, Jan 11: Lohri.");
    expect(opts.find((o) => o.date === "2030-01-09")?.disabledReason).toBeUndefined();
  });

  it("buildPlanContext carries the holidays through", () => {
    const ctx = buildPlanContext({
      sub: { status: "active" } as never,
      counts: { lastDeliveryDate: null, deliveryWeekdays: ["mon"], eatingWeekdays: null, servesWeekends: true } as never,
      cutoffHour: 18, timezone: "UTC", pause: { limits: { maxPauses: null }, usage: { count: 0 } } as never,
      holidays: { "2030-01-11": "Lohri" },
    });
    expect(ctx.holidays).toEqual({ "2030-01-11": "Lohri" });
  });
});
