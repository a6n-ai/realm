import { dayRange } from "@foundry/commons/util/dates";

/** Inclusive calendar range in `timeZone`, as the epoch window list filters expect. */
export function zonedRangeMs(from: string, to: string, timeZone: string): { from: number; to: number } {
  return { from: dayRange(from, timeZone).start, to: dayRange(to, timeZone).end - 1 };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function currentMonth(timeZone: string, now = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).format(now);
}

export function monthBounds(monthIso: string): { from: string; to: string } {
  const [y, m] = monthIso.split("-").map(Number) as [number, number];
  const last = daysInMonth(y, m);
  return {
    from: `${monthIso}-01`,
    to: `${monthIso}-${String(last).padStart(2, "0")}`,
  };
}

export const list = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/** Inclusive epoch window for the calendar month containing `now` in `timezone`. */
export function currentMonthEpochRange(timezone: string, now = Date.now()): { from: number; to: number } {
  const bounds = monthBounds(currentMonth(timezone, now));
  return zonedRangeMs(bounds.from, bounds.to, timezone);
}
