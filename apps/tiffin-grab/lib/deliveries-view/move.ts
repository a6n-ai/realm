import { cutoffMsFor, parseIsoDateUtc, weekdayKey } from "@foundry/commons";
import { countsToCoverage, dateCounts, mergeBlockReason, mergeCoverage, shiftTiffin, tiffinTotal } from "@/lib/menu/coverage";
import { carryTripDateIso } from "@/lib/menu/carry-trip";
import { NO_WEEKEND_DISH, type DayOfWeek } from "@/lib/menu/delivery-days";
import { humanDate, type CalendarDayInput, type PlanContext, type Trip } from "./index";

const weekdayName = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** First plan delivery weekday after the plan's last delivery: where "Move to end" sends a tiffin. */
export function planEndDate(ctx: Pick<PlanContext, "lastDeliveryDate" | "deliveryWeekdays">): string | null {
  if (!ctx.lastDeliveryDate) return null;
  const weekdays = ctx.deliveryWeekdays.filter((k) => k !== "sat" && k !== "sun");
  const cursor = parseIsoDateUtc(ctx.lastDeliveryDate);
  for (let i = 0; i < 7; i++) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (weekdays.includes(weekdayKey(cursor))) return cursor.toISOString().slice(0, 10);
  }
  return null;
}

/** Move goes up to the plan's last delivery plus a week of slack (always reaching planEndDate); 28 days when the plan has no end (legacy) or the maths ends up negative/tiny. */
function defaultHorizon(ctx: PlanContext, today: string): number {
  if (!ctx.lastDeliveryDate) return 28;
  const end = planEndDate(ctx);
  return Math.max(daysBetween(today, ctx.lastDeliveryDate) + 7, end ? daysBetween(today, end) + 1 : 0, 7);
}

export type MoveOption = {
  date: string;
  disabledReason?: string;
  /** Set when a scheduled trip already sits on this day: moving here combines the two. */
  merge: { units: number; covers: string[] } | null;
  /** Delivery day that carries this eating day: weekends and off-pattern days snap to the earlier trip. */
  carriedOn: string;
};

/** Tiffins per eating day on a trip: covers once each, plus one per extra. */
export function tripCounts(trip: Pick<Trip, "coversDates" | "extraDates">): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of [...trip.coversDates, ...(trip.extraDates ?? [])]) m.set(c, (m.get(c) ?? 0) + 1);
  return m;
}

/** Why `date`'s tiffin on this trip can't move, or null: a tiffin that was moved in never moves again. */
export function moveLockReason(trip: Pick<Trip, "coversDates" | "extraDates" | "movesIn" | "isMakeup">, date: string): string | null {
  if (trip.isMakeup) return "This tiffin was already moved once. It can't move again.";
  const movedIn = (trip.movesIn ?? []).filter((m) => m.to === date).length;
  return (tripCounts(trip).get(date) ?? 0) - movedIn < 1 ? "This tiffin was already moved once. It can't move again." : null;
}

/**
 * Mirrors rescheduleDelivery: ONE eating day's tiffin moves. The customer picks the day they
 * want to EAT it; it becomes that day's tiffin (that day's menu) and rides the carrying trip
 * (nearest plan weekday on or before it, so weekends ride Friday) — possibly this same trip.
 * Every check (past, cutoff, held target, 3-tiffin cap) runs on the carrying trip. The server
 * stays authoritative.
 */
export function moveOptions(trip: Trip, days: Pick<CalendarDayInput, "date" | "status" | "units" | "covers" | "extras" | "emptied">[], now: number, ctx: PlanContext, today: string, horizon?: number, sourceDate: string = trip.date): MoveOption[] {
  // An emptied row (all its tiffins moved away) is a free day again: the server revives it.
  const byDate = new Map(days.filter((d) => !d.emptied).map((d) => [d.date, d]));
  const weekdays = ctx.deliveryWeekdays.filter((k) => k !== "sat" && k !== "sun") as DayOfWeek[];
  const out: MoveOption[] = [];
  // A plan that hasn't started yet offers dates from its own start; an active plan starts from today.
  const rangeStart = ctx.startDate && ctx.startDate > today ? ctx.startDate : today;
  const span = horizon ?? defaultHorizon(ctx, rangeStart);
  const cursor = parseIsoDateUtc(rangeStart);
  const counts = tripCounts(trip);
  const perTiffin = trip.units / Math.max(1, tiffinTotal(counts));
  for (let i = 0; i < span; i++, cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = cursor.toISOString().slice(0, 10);
    const carriedOn = carryTripDateIso(date, weekdays);
    if (!carriedOn) continue;
    const target = byDate.get(carriedOn);
    let disabledReason: string | undefined;
    let merge: MoveOption["merge"] = null;
    if (date === sourceDate) disabledReason = "This is the day you're moving from.";
    else if (ctx.servesWeekends === false && (weekdayKey(cursor) === "sat" || weekdayKey(cursor) === "sun")) disabledReason = `${NO_WEEKEND_DISH}.`;
    else if (carriedOn < today || now > cutoffMsFor(carriedOn, ctx.cutoffHour, ctx.timezone)) disabledReason = `${humanDate(carriedOn)} is already closed for changes.`;
    else if (carriedOn === trip.date) {
      if (trip.status !== "upcoming") disabledReason = "This delivery isn't going out. Pick another day.";
      else merge = { units: trip.units, covers: countsToCoverage(shiftTiffin(counts, sourceDate, date)).covers };
    }
    else if (target && target.status !== "scheduled") disabledReason = `${humanDate(carriedOn)}'s delivery isn't going out. Pick another day.`;
    if (target?.status === "scheduled" && carriedOn !== trip.date) {
      const incoming = new Map([[date, 1]]);
      disabledReason ??= mergeBlockReason(dateCounts({ deliveryDate: carriedOn, coversDates: target.covers ?? null }, target.extras), incoming) ?? undefined;
      merge = { units: (target.units ?? 1) + tiffinTotal(incoming) * perTiffin, covers: mergeCoverage([...incoming.keys()], target.covers ?? [carriedOn]) };
    }
    out.push({ date, disabledReason, merge, carriedOn });
  }
  return out;
}
