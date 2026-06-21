export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

// Index by JS getUTCDay(): 0 = Sunday .. 6 = Saturday.
const BY_INDEX: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function weekdayKey(d: Date): Weekday {
  return BY_INDEX[d.getUTCDay()];
}

export function isWeekend(d: Date): boolean {
  const k = weekdayKey(d);
  return k === "sat" || k === "sun";
}

// Next UTC calendar day strictly after `from` that is a weekday (Mon–Fri),
// normalized to UTC midnight.
export function nextWeekday(from: Date): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while (isWeekend(d));
  return d;
}

// Parse a strict `YYYY-MM-DD` string to a UTC-midnight Date.
export function parseIsoDateUtc(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Invalid ISO date: ${iso}`);
  const [, y, mo, da] = m;
  const d = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(da)));
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid ISO date: ${iso}`);
  return d;
}
