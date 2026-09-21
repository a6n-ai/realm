// Snap an eating calendar date to the delivery trip that carries it: the nearest
// frequency delivery weekday on or BEFORE that date (never later). Weekends and
// off-pattern weekdays (e.g. Tue on MWF) land on Mon/Wed/Fri accordingly.
// Pure / DB-free — shared by client preview and server reschedule so they cannot disagree.
import { parseIsoDateUtc, weekdayKey } from "@foundry/commons";
import type { DayOfWeek } from "./delivery-days";

const WEEK_ORDER: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function isoDaysBefore(dateIso: string, n: number): string {
  const d = parseIsoDateUtc(dateIso);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

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
    const candidate = back === 0 ? eatingDateIso : isoDaysBefore(eatingDateIso, back);
    const key = weekdayKey(parseIsoDateUtc(candidate)) as DayOfWeek;
    if (allowed.has(key)) return candidate;
  }
  return null;
}

export type EatDayCarryPreview = {
  eatingDate: string;
  eatingWeekday: DayOfWeek;
  carriedOn: string;
  carriedWeekday: DayOfWeek;
  /** True when the eating day is not itself a delivery weekday (snapped). */
  snapped: boolean;
};

/** Client + server preview copy inputs. Returns null when the date cannot be carried. */
export function previewEatDayCarry(
  eatingDateIso: string,
  deliveryWeekdays: readonly DayOfWeek[],
): EatDayCarryPreview | null {
  const carriedOn = carryTripDateIso(eatingDateIso, deliveryWeekdays);
  if (!carriedOn) return null;
  const eatingWeekday = weekdayKey(parseIsoDateUtc(eatingDateIso)) as DayOfWeek;
  const carriedWeekday = weekdayKey(parseIsoDateUtc(carriedOn)) as DayOfWeek;
  return {
    eatingDate: eatingDateIso,
    eatingWeekday,
    carriedOn,
    carriedWeekday,
    snapped: carriedOn !== eatingDateIso,
  };
}

const SHORT: Record<DayOfWeek, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

/** "Tue 23 → delivered with your Mon 22 delivery" */
export function formatEatDayCarryPreview(
  preview: EatDayCarryPreview,
  opts?: { targetAlreadyHasTrip?: boolean; targetUnitsAfter?: number },
): string {
  const eatDay = Number(preview.eatingDate.slice(8, 10));
  const carryDay = Number(preview.carriedOn.slice(8, 10));
  const eat = `${SHORT[preview.eatingWeekday]} ${eatDay}`;
  const carry = `${SHORT[preview.carriedWeekday]} ${carryDay}`;
  if (!preview.snapped) {
    return opts?.targetAlreadyHasTrip
      ? `${eat} already has a delivery — your food will merge onto that trip` +
          (opts.targetUnitsAfter != null ? ` (${opts.targetUnitsAfter} days)` : "")
      : `${eat} is a delivery day — food arrives that day`;
  }
  let line = `${eat} → delivered with your ${carry} delivery`;
  if (opts?.targetAlreadyHasTrip && opts.targetUnitsAfter != null) {
    line += ` — ${SHORT[preview.carriedWeekday]}'s delivery will then carry ${opts.targetUnitsAfter} days`;
  } else if (opts?.targetAlreadyHasTrip) {
    line += ` — merges onto the existing ${carry} trip`;
  }
  return line;
}

export function isDeliveryWeekday(dateIso: string, deliveryWeekdays: readonly DayOfWeek[]): boolean {
  return deliveryWeekdays.includes(weekdayKey(parseIsoDateUtc(dateIso)) as DayOfWeek);
}

/** Exported for tests — week order used when walking backward. */
export const CARRY_WEEK_ORDER = WEEK_ORDER;
