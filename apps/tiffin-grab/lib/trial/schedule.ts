import { parseIsoDateUtc, weekdayKey, nextWeekday, ValidationError } from "@foundry/commons";
import { validateStartDate } from "@/lib/services/start-date";

export const TRIAL_WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type TrialWeekday = (typeof TRIAL_WEEKDAYS)[number];

export function orderedTrialWeekdays(days: readonly string[]): TrialWeekday[] {
  const picked = new Set(days);
  return TRIAL_WEEKDAYS.filter((d) => picked.has(d));
}

/** Send days for a trial of this meal: Sat/Sun drop out when the meal has no weekend dish. */
export function trialSendDays(weekdays: readonly string[], servesWeekends: boolean): TrialWeekday[] {
  return orderedTrialWeekdays(weekdays).filter((d) => servesWeekends || (d !== "sat" && d !== "sun"));
}

/** Next `length` dates from `startDate` whose weekday is allowed, including the start date. */
export function trialDeliveryDates(startDate: string, length: number, weekdays: readonly string[]): string[] {
  if (!Number.isInteger(length) || length < 1) throw new ValidationError("Choose at least 1 trial day");
  const allowed = new Set(weekdays);
  const start = parseIsoDateUtc(startDate);
  if (!allowed.has(weekdayKey(start))) throw new ValidationError("A trial can't be sent on that day");
  const dates: string[] = [];
  const cursor = new Date(start);
  for (let i = 0; dates.length < length && i < 400; i++) {
    if (allowed.has(weekdayKey(cursor))) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  if (dates.length !== length) throw new ValidationError("Couldn't place every trial day on the selected weekdays");
  return dates;
}

/** Weeks stored on the order so the overlap window covers the last trial delivery. */
export function durationWeeksCovering(startDate: string, lastDate: string): number {
  const spanDays = Math.round((parseIsoDateUtc(lastDate).getTime() - parseIsoDateUtc(startDate).getTime()) / 86_400_000) + 1;
  return Math.max(1, Math.ceil(spanDays / 7));
}

/**
 * Start must be an allowed send day, and not before the next bookable day.
 * Weekday starts use the same floor as a normal plan. A Saturday or Sunday
 * start is allowed when that day is a send day, as long as it is after today.
 */
export function assertTrialStart(startDate: string, weekdays: readonly string[], today: Date): void {
  const start = parseIsoDateUtc(startDate);
  const wk = weekdayKey(start);
  if (!weekdays.includes(wk)) throw new ValidationError("A trial can't be sent on that day");
  if (wk === "sat" || wk === "sun") {
    const tomorrow = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1));
    if (start.getTime() < tomorrow.getTime()) {
      throw new ValidationError("Start date must be on or after the next available day");
    }
    return;
  }
  validateStartDate(startDate, [...weekdays], today);
}

/** First bookable start: next weekday, or tomorrow when a weekend is a send day. */
export function earliestTrialIso(today: Date, weekdays: readonly string[]): string {
  if (weekdays.includes("sat") || weekdays.includes("sun")) {
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1)).toISOString().slice(0, 10);
  }
  return nextWeekday(today).toISOString().slice(0, 10);
}
