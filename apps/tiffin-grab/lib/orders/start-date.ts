import { isCutoffPassed } from "@/lib/dates/cutoff";
import { MON_FRI } from "@/lib/menu/delivery-days";
import { cutoffMsFor, isWeekend, parseIsoDateUtc, weekdayKey, nextWeekday, ValidationError, zonedDateIso } from "@foundry/commons";
import { utcIso } from "@foundry/commons/util/dates";

/**
 * The day start-date rules count from, as UTC midnight: today's calendar date in the
 * app timezone (not UTC's, which is already tomorrow on a Toronto evening), or
 * tomorrow once the app-settings cutoff hour has passed. Tomorrow's tiffins close at
 * that hour, so a plan ordered after it can start the day after at the earliest.
 */
export function appToday(timezone = "America/Toronto", cutoffHour?: number, now = Date.now()): Date {
  const today = parseIsoDateUtc(zonedDateIso(now, timezone));
  if (cutoffHour == null) return today;
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return isCutoffPassed(cutoffMsFor(utcIso(tomorrow), cutoffHour, timezone), now) ? tomorrow : today;
}

// Validate a customer-chosen subscription start date.
// - must be on/after the next weekday after `today` (no past, no same-day, skip weekends);
//   `today` comes from appToday, so it is already tomorrow once the cutoff has passed
// - must not be Saturday/Sunday
// - its weekday must be in the plan's allowedStartDays
export function validateStartDate(startDate: string, allowedStartDays: string[], today: Date): void {
  const start = parseIsoDateUtc(startDate); // throws on malformed
  const earliest = nextWeekday(today);
  if (start.getTime() < earliest.getTime()) {
    throw new ValidationError("Start date must be on or after the next available weekday");
  }
  if (isWeekend(start)) {
    throw new ValidationError("Start date cannot be a weekend");
  }
  const wk = weekdayKey(start);
  if (!allowedStartDays.includes(wk)) {
    throw new ValidationError("This plan cannot start on the selected day");
  }
}

/** The first delivery of a (re)built schedule must still be ahead of its cutoff. */
export function assertFirstDeliveryOpen(first: { deliveryDate: string; cutoffAt: number } | undefined, now = Date.now()): void {
  if (first && isCutoffPassed(first.cutoffAt, now)) {
    throw new ValidationError(`The cutoff for ${first.deliveryDate} has passed. Pick a later start date`);
  }
}

/**
 * Earliest start a weekly plan can take: the next weekday after `today`, or `minStartDate`
 * when later (the day after a running plan), moved forward to a day the plan starts on
 * and that is not a closed (holiday) day.
 */
export function earliestPlanStart(
  today: Date,
  allowedStartDays: readonly string[],
  minStartDate: string | null = null,
  closed: ReadonlySet<string> = new Set(),
): string {
  return startWindow(utcIso(nextWeekday(today)), minStartDate, allowedStartDays, closed).earliest;
}

/** The earliest date a start may be picked (`tomorrow`, or a later `minStartDate`) and the first day on/after it the plan starts on. */
export function startWindow(tomorrow: string, minStartDate: string | null | undefined, allowedStartDays: readonly string[], closed: ReadonlySet<string>) {
  const minDate = minStartDate && minStartDate > tomorrow ? minStartDate : tomorrow;
  return { minDate, earliest: firstStartOnOrAfter(minDate, allowedStartDays, closed) };
}

/**
 * First day on/after `fromIso` whose weekday is in `allowed` and is not closed. Looks two
 * weeks ahead, or a year when days are closed so a run of holidays cannot hand one back;
 * `fromIso` itself only if nothing qualifies in that span.
 */
export function firstStartOnOrAfter(fromIso: string, allowed: readonly string[], closed: ReadonlySet<string> = new Set()): string {
  const d = parseIsoDateUtc(fromIso);
  const span = closed.size ? 366 : 14;
  for (let i = 0; i < span; i++, d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = utcIso(d);
    if (allowed.includes(weekdayKey(d)) && !closed.has(iso)) return iso;
  }
  return fromIso;
}

/**
 * Weekdays a weekly order may start on: the plan's start days that are also delivery days, because the start date
 * is the first delivery (starting Thu on Mon/Wed/Fri would first deliver Fri). Falls back to the plan's days when
 * they share none, or the frequency has no weekdays.
 */
export function planStartDays(allowedStartDays: readonly string[] | null | undefined, frequencyWeekdays: readonly string[] | null | undefined): string[] {
  const days = allowedStartDays?.length ? [...allowedStartDays] : [...MON_FRI];
  const both = days.filter((d) => frequencyWeekdays?.includes(d));
  return both.length ? both : days;
}
