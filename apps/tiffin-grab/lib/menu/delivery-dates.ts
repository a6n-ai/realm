import { parseIsoDateUtc, weekdayKey, zonedDateIso } from "@realm/commons";

export type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type DeliveryDate = { dateIso: string; dayOfWeek: DayOfWeek; weekStartIso: string };

const iso = (d: Date) => d.toISOString().slice(0, 10);

// Monday of the week containing dateIso (UTC date math).
export function mondayOfIso(dateIso: string): string {
  const d = parseIsoDateUtc(dateIso);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const deltaToMonday = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + deltaToMonday);
  return iso(d);
}

// First durationWeeks × deliveryDays.length delivery dates on/after startDate.
// A pauseWindow (inclusive ISO dates) suppresses any delivery inside it without
// counting it toward the total, so the tail extends to still yield all deliveries.
export function subscriptionDeliveryDates(input: {
  startDate: string;
  durationWeeks: number;
  deliveryDays: DayOfWeek[];
  pauseWindow?: { from: string; until: string };
}): DeliveryDate[] {
  const want = new Set(input.deliveryDays);
  const total = input.durationWeeks * input.deliveryDays.length;
  const pause = input.pauseWindow;
  const out: DeliveryDate[] = [];
  const d = parseIsoDateUtc(input.startDate);
  // Walk forward day-by-day, collecting matching weekdays until we have `total`.
  // Skipped (paused) days don't count, so widen the guard to allow the extension.
  for (let guard = 0; out.length < total && guard < total * 7 + 400; guard++) {
    const dow = weekdayKey(d);
    const dateIso = iso(d);
    const paused = !!pause && dateIso >= pause.from && dateIso <= pause.until;
    if (want.has(dow) && !paused) {
      out.push({ dateIso, dayOfWeek: dow, weekStartIso: mondayOfIso(dateIso) });
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// The Monday starting the week AFTER the current week, in `timezone` (coming service week).
export function comingWeekStartIso(nowMs: number, timezone: string): string {
  const todayIso = zonedDateIso(nowMs, timezone);
  const thisMonday = parseIsoDateUtc(mondayOfIso(todayIso));
  thisMonday.setUTCDate(thisMonday.getUTCDate() + 7);
  return iso(thisMonday);
}
