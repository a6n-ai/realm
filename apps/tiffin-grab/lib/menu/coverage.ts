import { parseIsoDateUtc } from "@foundry/commons";
import type { DayOfWeek } from "./delivery-days";

const WEEK_ORDER: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function addDays(iso: string, n: number): string {
  const d = parseIsoDateUtc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** ISO dates of the eating days a trip carries; a carried day maps to the trip's date plus its weekday offset from the trip's own day. */
export function tripCoverage(deliveryDate: string, tripDay: DayOfWeek, carriedDays: DayOfWeek[]): string[] {
  const base = WEEK_ORDER.indexOf(tripDay);
  return carriedDays.map((d) => addDays(deliveryDate, WEEK_ORDER.indexOf(d) - base)).sort();
}

/** NULL covers_dates is a legacy row: it covers only its own date. */
export function coveredDates(d: { deliveryDate: string; coversDates: string[] | null }): string[] {
  return d.coversDates ?? [d.deliveryDate];
}

export function mergeCoverage(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])].sort();
}

/** A day holds at most 2 tiffins (its own + one moved in); a trip carries at most 3. */
export const MAX_TIFFINS_PER_DAY = 2;
export const MAX_TIFFINS_PER_TRIP = 3;

/** Tiffins per eating day on a trip: 1 for each covered date, +1 for each extra. */
export function dateCounts(d: { deliveryDate: string; coversDates: string[] | null }, extraDates: readonly string[] = []): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of coveredDates(d)) m.set(c, (m.get(c) ?? 0) + 1);
  for (const e of extraDates) m.set(e, (m.get(e) ?? 0) + 1);
  return m;
}

/** Why `incoming` (date -> tiffins) cannot join `target`, or null when it fits. */
export function mergeBlockReason(target: Map<string, number>, incoming: Map<string, number>): string | null {
  const merged = new Map(target);
  for (const [k, v] of incoming) merged.set(k, (merged.get(k) ?? 0) + v);
  if ([...merged.values()].some((n) => n > MAX_TIFFINS_PER_DAY)) return `A day can hold at most ${MAX_TIFFINS_PER_DAY} tiffins.`;
  if ([...merged.values()].reduce((a, b) => a + b, 0) > MAX_TIFFINS_PER_TRIP) return `A delivery can carry at most ${MAX_TIFFINS_PER_TRIP} tiffins.`;
  return null;
}

/** Only rows with explicit coverage are checked; legacy rows carry weekend bundles that predate covers_dates. */
export function assertCoverageUnits(d: { coversDates: string[] | null; tiffinUnits: number }, persons: number, extraCount = 0): void {
  const days = (d.coversDates?.length ?? 0) + extraCount;
  if (d.coversDates && d.tiffinUnits !== days * persons) {
    throw new Error(`Trip carries ${d.tiffinUnits} tiffins but covers ${days} days x ${persons} persons`);
  }
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Mon and Tue", "Mon, Tue and Wed" — for customer copy naming the days a skipped trip carried. */
export function formatMissedDays(dates: string[]): string {
  const names = dates.map((d) => DAY_LABELS[parseIsoDateUtc(d).getUTCDay()]);
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** A swap with NULL for_date belongs to the trip's own date. */
export function swapAppliesTo(swapForDate: string | null, tripDate: string, eatingDate: string): boolean {
  return (swapForDate ?? tripDate) === eatingDate;
}

/** "Covers Mon + Tue" for a trip carrying several eating days; null when it only carries its own day. */
export function formatCoversLabel(dates: string[]): string | null {
  if (dates.length < 2) return null;
  return `Covers ${dates.map((d) => DAY_LABELS[parseIsoDateUtc(d).getUTCDay()]).join(" + ")}`;
}

const FULL_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function fullDayName(iso: string): string {
  return FULL_DAY_NAMES[parseIsoDateUtc(iso).getUTCDay()]!;
}
