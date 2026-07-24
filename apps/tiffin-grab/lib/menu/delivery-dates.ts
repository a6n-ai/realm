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
// A row factory: produces the exact date set materialized into `deliveries` rows.
export function subscriptionDeliveryDates(input: {
  startDate: string;
  durationWeeks: number;
  deliveryDays: DayOfWeek[];
}): DeliveryDate[] {
  const want = new Set(input.deliveryDays);
  const total = input.durationWeeks * input.deliveryDays.length;
  const out: DeliveryDate[] = [];
  const d = parseIsoDateUtc(input.startDate);
  // Walk forward day-by-day, collecting matching weekdays until we have `total`.
  for (let guard = 0; out.length < total && guard < total * 7 + 400; guard++) {
    const dow = weekdayKey(d);
    const dateIso = iso(d);
    if (want.has(dow)) {
      out.push({ dateIso, dayOfWeek: dow, weekStartIso: mondayOfIso(dateIso) });
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// Monday of the calendar week containing `nowMs`, in app-settings `timezone`.
// Menu weeks are stored by this Monday — meal matching must use the same key.
export function thisWeekStartIso(nowMs: number, timezone: string): string {
  return mondayOfIso(zonedDateIso(nowMs, timezone));
}

// The Monday starting the week AFTER the current week, in `timezone`.
export function comingWeekStartIso(nowMs: number, timezone: string): string {
  const thisMonday = parseIsoDateUtc(thisWeekStartIso(nowMs, timezone));
  thisMonday.setUTCDate(thisMonday.getUTCDate() + 7);
  return iso(thisMonday);
}
