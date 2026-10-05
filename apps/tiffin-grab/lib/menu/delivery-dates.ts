import { parseIsoDateUtc, weekdayKey, zonedDateIso } from "@foundry/commons";
import { planWeek, type DayOfWeek } from "./delivery-days";

export type { DayOfWeek };
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

export type DatedTrip = { dateIso: string; day: DayOfWeek; units: number; days: DayOfWeek[] };

/** Every delivery a subscription will get, from the same walk materializeDeliveries runs.
 * `shifted` is true when the start week's earlier delivery days are skipped and land after the last full week. */
export function subscriptionTrips(input: {
  startDate: string;
  durationWeeks: number;
  deliveryDays: DayOfWeek[];
  eatingDays: DayOfWeek[];
}): { trips: DatedTrip[]; shifted: boolean } | null {
  const week = planWeek(input.deliveryDays, input.eatingDays);
  if (!week?.length || input.durationWeeks < 1) return null;
  const byDay = new Map(week.map((t) => [t.day, t]));
  const dates = subscriptionDeliveryDates({ startDate: input.startDate, durationWeeks: input.durationWeeks, deliveryDays: week.map((t) => t.day) });
  if (!dates.length) return null;
  const monday = mondayOfIso(input.startDate);
  const shifted = week.some((t) => addDaysIso(monday, WEEK.indexOf(t.day)) < input.startDate);
  return { trips: dates.map((d) => ({ dateIso: d.dateIso, ...byDay.get(d.dayOfWeek)! })), shifted };
}

/** Trips grouped into their Mon–Sun weeks, in order. */
export function tripsByWeek(trips: DatedTrip[]): { weekStart: string; trips: DatedTrip[] }[] {
  const weeks = new Map<string, DatedTrip[]>();
  for (const t of trips) {
    const key = mondayOfIso(t.dateIso);
    weeks.set(key, [...(weeks.get(key) ?? []), t]);
  }
  return [...weeks].map(([weekStart, trips]) => ({ weekStart, trips }));
}

const WEEK: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function addDaysIso(dateIso: string, n: number): string {
  const d = parseIsoDateUtc(dateIso);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
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
