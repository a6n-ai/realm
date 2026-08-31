import { parseIsoDateUtc } from "./dates";

// Offset (minutes) of `timezone` from UTC at instant `utcMs`. Negative west of UTC
// (Toronto = -300 EST / -240 EDT). Derived per-instant from Intl, so DST-correct.
export function tzOffsetMinutes(timezone: string, utcMs: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const p = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  // Reinterpret the wall-clock parts as if they were UTC, then diff against the real instant.
  let hour = Number(p.hour);
  if (hour === 24) hour = 0; // some engines emit "24" for midnight
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hour, Number(p.minute), Number(p.second));
  return Math.round((asUtc - utcMs) / 60000);
}

// The YYYY-MM-DD calendar date at instant `utcMs` in `timezone`.
export function zonedDateIso(utcMs: number, timezone: string): string {
  const dtf = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
  const p = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

// Epoch-ms of `cutoffHour`:00 wall-clock in `timezone`, on the day BEFORE deliveryDateIso.
export function cutoffMsFor(deliveryDateIso: string, cutoffHour: number, timezone: string): number {
  const d = parseIsoDateUtc(deliveryDateIso);
  d.setUTCDate(d.getUTCDate() - 1); // day before
  // First guess: treat cutoffHour as if UTC, then correct by the zone offset at that instant.
  const guess = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), cutoffHour);
  const offset = tzOffsetMinutes(timezone, guess);
  return guess - offset * 60000;
}
