import { cutoffMsFor, parseIsoDateUtc, weekdayKey } from "@foundry/commons";
import { dateCounts, mergeBlockReason, mergeCoverage } from "@/lib/menu/coverage";
import { carryTripDateIso } from "@/lib/menu/carry-trip";
import type { DayOfWeek } from "@/lib/menu/delivery-days";
import { humanDate, type CalendarDayInput, type PlanContext, type Trip } from "./index";

const weekdayName = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** Move goes up to the plan's last delivery plus a week of slack; 28 days when the plan has no end (legacy) or the maths ends up negative/tiny. */
function defaultHorizon(ctx: PlanContext, today: string): number {
  if (!ctx.lastDeliveryDate) return 28;
  return Math.max(daysBetween(today, ctx.lastDeliveryDate) + 7, 7);
}

export type MoveOption = {
  date: string;
  disabledReason?: string;
  /** Set when a scheduled trip already sits on this day: moving here combines the two. */
  merge: { units: number; covers: string[] } | null;
  /** Delivery day that carries this eating day: weekends and off-pattern days snap to the earlier trip. */
  carriedOn: string;
};

/**
 * Mirrors rescheduleDelivery: the customer picks the day they want to EAT; it snaps to the carrying
 * trip (nearest plan weekday on or before it, so weekends ride Friday). Every check (past, cutoff,
 * held target, already-covered) runs on the carrying trip. The server stays authoritative.
 *
 * `sourceDate` is WHICH eating day the customer is moving. Left at the trip's own date (the
 * default), the whole trip moves — a multi-day trip's weekend riders have nowhere else to ride.
 * Any OTHER day the trip covers splits off just that one tiffin: the rest stays on the original
 * delivery, unaffected.
 */
export function moveOptions(trip: Trip, days: Pick<CalendarDayInput, "date" | "status" | "units" | "covers" | "extras">[], now: number, ctx: PlanContext, today: string, horizon?: number, sourceDate: string = trip.date): MoveOption[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const weekdays = ctx.deliveryWeekdays.filter((k) => k !== "sat" && k !== "sun") as DayOfWeek[];
  const out: MoveOption[] = [];
  // A plan that hasn't started yet offers dates from its own start; an active plan starts from today.
  const rangeStart = ctx.startDate && ctx.startDate > today ? ctx.startDate : today;
  const span = horizon ?? defaultHorizon(ctx, rangeStart);
  const cursor = parseIsoDateUtc(rangeStart);
  const canSplitLeadDay = ctx.frequencyKey === "5_day" || ctx.deliveryWeekdays.length === 5;
  const split = trip.coversDates.length > 1 && trip.coversDates.includes(sourceDate) && (sourceDate !== trip.date || canSplitLeadDay);
  const splitExtras = (trip.extraDates ?? []).filter((d) => d === sourceDate);
  // Per-tiffin unit count, derived rather than plumbed: units already includes any extras.
  const perTiffin = trip.units / Math.max(1, trip.coversDates.length + (trip.extraDates?.length ?? 0));
  for (let i = 0; i < span; i++, cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = cursor.toISOString().slice(0, 10);
    const carriedOn = carryTripDateIso(date, weekdays);
    if (!carriedOn) continue;
    const target = byDate.get(carriedOn);
    let disabledReason: string | undefined;
    if (carriedOn === trip.date) disabledReason = date === sourceDate ? "This is the day you're moving from." : "That day already rides on this trip.";
    else if (carriedOn < today || now > cutoffMsFor(carriedOn, ctx.cutoffHour, ctx.timezone)) disabledReason = `${humanDate(carriedOn)} is already closed for changes.`;
    else if (trip.pooled && ctx.lastDeliveryDate && carriedOn <= ctx.lastDeliveryDate) disabledReason = `A pooled tiffin can only go after ${humanDate(ctx.lastDeliveryDate)}.`;
    else if (target && target.status !== "scheduled") disabledReason = `${humanDate(carriedOn)} already has a held trip. Pick another day.`;
    else if (target && trip.pooled) disabledReason = `${humanDate(carriedOn)} already has a delivery. Pick an open day for a pooled tiffin.`;
    let merge: MoveOption["merge"] = null;
    if (target?.status === "scheduled" && carriedOn !== trip.date) {
      const carried = split ? [sourceDate] : [...new Set(trip.coversDates.map((d) => (d === trip.date ? date : d)))].sort();
      const movingExtras = split ? splitExtras : (trip.extraDates ?? []);
      if (!disabledReason) {
        const incoming = new Map<string, number>();
        for (const c of [...carried, ...movingExtras]) incoming.set(c, (incoming.get(c) ?? 0) + 1);
        disabledReason = mergeBlockReason(dateCounts({ deliveryDate: carriedOn, coversDates: target.covers ?? null }, target.extras), incoming) ?? undefined;
      }
      const covers = mergeCoverage(carried, target.covers ?? [carriedOn]);
      const movingUnits = split ? (carried.length + movingExtras.length) * perTiffin : trip.units;
      merge = { units: (target.units ?? 1) + movingUnits, covers };
    }
    out.push({ date, disabledReason, merge, carriedOn });
  }
  return out;
}
