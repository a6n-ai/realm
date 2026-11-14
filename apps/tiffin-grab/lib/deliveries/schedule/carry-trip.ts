// Snap an eating calendar date to the delivery trip that carries it: the nearest
// frequency delivery weekday on or BEFORE that date (never later). Weekends and
// off-pattern weekdays (e.g. Tue on MWF) land on Mon/Wed/Fri accordingly.
// Pure / DB-free — shared by client preview and server reschedule so they cannot disagree.
import { parseIsoDateUtc, weekdayKey } from "@foundry/commons";
import type { DayOfWeek } from "./delivery-days";
import { addDaysIso } from "@foundry/commons/util/dates";

/**
 * Carrying trip date for eating day `eatingDateIso`, or null if no delivery weekday
 * exists within a week lookback (malformed frequency set).
 */
export function carryTripDateIso(
  eatingDateIso: string,
  deliveryWeekdays: readonly DayOfWeek[],
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eatingDateIso)) return null;
  const allowed = new Set(deliveryWeekdays);
  if (allowed.size === 0) return null;
  for (let back = 0; back < 7; back++) {
    const candidate = back === 0 ? eatingDateIso : addDaysIso(eatingDateIso, -back);
    const key = weekdayKey(parseIsoDateUtc(candidate)) as DayOfWeek;
    if (allowed.has(key)) return candidate;
  }
  return null;
}
