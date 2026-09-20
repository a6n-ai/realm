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

/** Only rows with explicit coverage are checked; legacy rows carry weekend bundles that predate covers_dates. */
export function assertCoverageUnits(d: { coversDates: string[] | null; tiffinUnits: number }, persons: number): void {
  if (d.coversDates && d.tiffinUnits !== d.coversDates.length * persons) {
    throw new Error(`Trip carries ${d.tiffinUnits} tiffins but covers ${d.coversDates.length} days x ${persons} persons`);
  }
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Mon and Tue", "Mon, Tue and Wed" — for customer copy naming the days a skipped trip carried. */
export function formatMissedDays(dates: string[]): string {
  const names = dates.map((d) => DAY_LABELS[parseIsoDateUtc(d).getUTCDay()]);
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
