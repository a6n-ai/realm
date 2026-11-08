import { zonedDateIso } from "@foundry/commons";

export const DAY_MS = 86_400_000;

/** Short weekday names indexed by `getUTCDay()` (0 = Sun). */
export const DAY_NAMES: readonly string[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const WEEKEND_DAYS: ReadonlySet<string> = new Set(["sat", "sun"]);
export const isWeekendDay = (d: string): boolean => WEEKEND_DAYS.has(d);

/** UTC midnight of a `YYYY-MM-DD` day. Lenient: invalid input yields an Invalid Date (use `parseIsoDateUtc` to throw). */
export const isoToUtcDate = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

/** Local-zone midnight of a `YYYY-MM-DD` day (browser pickers). */
export const isoToLocalDate = (iso: string): Date => new Date(`${iso}T00:00:00`);

/** True for a well-formed `YYYY-MM-DD` that names a real calendar day (rejects 2026-02-30). */
export function isRealDate(iso: string): boolean {
  const d = isoToUtcDate(iso);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(d.getTime()) && utcIso(d) === iso;
}

/** `YYYY-MM-DD` of a Date's UTC calendar day. */
export const utcIso = (d: Date): string => d.toISOString().slice(0, 10);

/** `YYYY-MM-DD` of a Date's calendar day in the runtime's local zone (browser pickers). */
export const localIso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function addDaysIso(iso: string, n: number): string {
  const d = isoToUtcDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return utcIso(d);
}

/** Monday = 0 … Sunday = 6 for a `YYYY-MM-DD` day. */
export const mondayIndex = (iso: string): number => (isoToUtcDate(iso).getUTCDay() + 6) % 7;

export const mondayOfIso = (iso: string): string => addDaysIso(iso, -mondayIndex(iso));

/** Whole calendar days from `fromIso` to `toIso`; positive when `toIso` is later. */
export const daysBetween = (fromIso: string, toIso: string): number =>
  Math.round((isoToUtcDate(toIso).getTime() - isoToUtcDate(fromIso).getTime()) / DAY_MS);

/** Every day from `from` to `to`, inclusive. */
export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  for (const d = isoToUtcDate(from), end = isoToUtcDate(to); d <= end; d.setUTCDate(d.getUTCDate() + 1)) out.push(utcIso(d));
  return out;
}

/** Calendar date of an instant in `timeZone` as `YYYY-MM-DD`. */
export const isoDateInZone = zonedDateIso;

export const todayInZone = (timeZone: string, now = Date.now()): string => zonedDateIso(now, timeZone);

function zoneOffsetMs(epoch: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(epoch));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  // h23 can report midnight as hour 24 on the previous calendar day.
  const hour = get("hour") % 24;
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return asUtc - epoch;
}

/** Epoch ms of midnight at the start of `iso` in `timeZone`. */
export function zonedDayStart(iso: string, timeZone: string): number {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const utcMidnight = Date.UTC(y, m - 1, d);
  let start = utcMidnight - zoneOffsetMs(utcMidnight, timeZone);
  start = utcMidnight - zoneOffsetMs(start, timeZone);
  return start;
}

/** Epoch ms `[start, end)` of the calendar day `iso` in `timeZone`. */
export const dayRange = (iso: string, timeZone: string): { start: number; end: number } => ({
  start: zonedDayStart(iso, timeZone),
  end: zonedDayStart(addDaysIso(iso, 1), timeZone),
});
