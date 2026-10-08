import { isWeekend, parseIsoDateUtc, weekdayKey, nextWeekday, ValidationError, zonedDateIso } from "@foundry/commons";

/**
 * Today's calendar date in the app timezone, as UTC midnight. Start-date rules use
 * this, not the UTC date, which is already tomorrow on a Toronto evening.
 */
export function appToday(timezone = "America/Toronto", now = Date.now()): Date {
  return parseIsoDateUtc(zonedDateIso(now, timezone));
}

// Validate a customer-chosen subscription start date.
// - must be on/after the next weekday after `today` (no past, no same-day, skip weekends)
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

/**
 * Earliest start a weekly plan can take: the next weekday after `today`, or `minStartDate`
 * when later (the day after a running plan), moved forward to a day the plan starts on.
 */
export function earliestPlanStart(today: Date, allowedStartDays: readonly string[], minStartDate: string | null = null): string {
  const tomorrow = nextWeekday(today).toISOString().slice(0, 10);
  const from = minStartDate && minStartDate > tomorrow ? minStartDate : tomorrow;
  return firstStartOnOrAfter(from, allowedStartDays);
}

/** First day on/after `fromIso` whose weekday is in `allowed` (`fromIso` itself if none within two weeks). */
export function firstStartOnOrAfter(fromIso: string, allowed: readonly string[]): string {
  const d = parseIsoDateUtc(fromIso);
  for (let i = 0; i < 14; i++, d.setUTCDate(d.getUTCDate() + 1)) {
    if (allowed.includes(weekdayKey(d))) return d.toISOString().slice(0, 10);
  }
  return fromIso;
}
