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
