import { cutoffMsFor, parseIsoDateUtc } from "@foundry/commons";
import { mergeCoverage } from "@/lib/menu/coverage";
import { humanDate, type CalendarDayInput, type PlanContext, type Trip } from "./index";

export type MoveOption = {
  date: string;
  disabledReason?: string;
  /** Set when a scheduled trip already sits on this day: moving here combines the two. */
  merge: { units: number; covers: string[] } | null;
};

const KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * Mirrors rescheduleDelivery's checks (plan weekday, no weekend, not past, target cutoff open,
 * target not held) so the picker only offers days the server will accept. The server stays authoritative.
 */
export function moveOptions(trip: Trip, days: Pick<CalendarDayInput, "date" | "status" | "units" | "covers">[], now: number, ctx: PlanContext, today: string, horizon = 28): MoveOption[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const out: MoveOption[] = [];
  const cursor = parseIsoDateUtc(today);
  for (let i = 0; i < horizon; i++, cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = cursor.toISOString().slice(0, 10);
    const key = KEYS[cursor.getUTCDay()]!;
    if (key === "sat" || key === "sun" || !ctx.deliveryWeekdays.includes(key)) continue;
    const target = byDate.get(date);
    let disabledReason: string | undefined;
    if (date === trip.date) disabledReason = "This is the day you're moving from.";
    else if (now > cutoffMsFor(date, ctx.cutoffHour, ctx.timezone)) disabledReason = `${humanDate(date)} is already closed for changes.`;
    else if (trip.pooled && ctx.lastDeliveryDate && date <= ctx.lastDeliveryDate) disabledReason = `A pooled tiffin can only go after ${humanDate(ctx.lastDeliveryDate)}.`;
    else if (target && target.status !== "scheduled") disabledReason = `${humanDate(date)} already has a held trip. Pick another day.`;
    else if (target && trip.pooled) disabledReason = `${humanDate(date)} already has a delivery. Pick an open day for a pooled tiffin.`;
    const merge = target?.status === "scheduled" ? { units: (target.units ?? 1) + trip.units, covers: mergeCoverage(trip.coversDates, target.covers ?? [date]) } : null;
    out.push({ date, disabledReason, merge });
  }
  return out;
}
