import { parseIsoDateUtc } from "@realm/commons";

export function epochToDate(ms: number): Date {
  return new Date(ms);
}

type AbsoluteMode = "date" | "datetime" | "time";

const PRESETS: Record<AbsoluteMode, Intl.DateTimeFormatOptions> = {
  date: { year: "numeric", month: "short", day: "numeric" },
  datetime: { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
  time: { hour: "numeric", minute: "2-digit" },
};

type FormatEpochOpts =
  | { mode: "relative"; locale?: string }
  // timeZone is REQUIRED: omitting it silently formats in the runtime's zone (the server's
  // during SSR), which is the bug this audit exists to fix.
  | { mode?: AbsoluteMode; timeZone: string; withZone?: boolean; locale?: string };

export function formatEpoch(ms: number, opts: FormatEpochOpts): string {
  if (opts.mode === "relative") {
    const { locale = "en-US" } = opts;
    const diff = ms - Date.now();
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const mins = Math.round(diff / 60000);
    if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
    const hours = Math.round(mins / 60);
    if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
    return rtf.format(Math.round(hours / 24), "day");
  }
  // Locale defaults to a fixed "en-US" rather than the runtime's own default: leaving it
  // undefined lets Intl fall back to the server process's locale during SSR and the browser's
  // OS/user locale on the client, which can disagree on field order ("Sun, 19 Jul 2026" vs
  // "Sun, Jul 19, 2026") and trips a hydration mismatch — surfaced by the Tiffin Calendar's
  // day-detail panel, which (unlike the old card list) renders a formatted date unconditionally
  // on first paint.
  const { mode = "datetime", timeZone, withZone, locale = "en-US" } = opts;
  return new Intl.DateTimeFormat(locale, {
    ...PRESETS[mode],
    timeZone,
    ...(withZone ? { timeZoneName: "short" } : {}),
  }).format(ms);
}

// Labeled datetime in the app/delivery timezone (e.g. "Jul 16, 2026, 6:00 PM EDT").
export function formatDeliveryTime(ms: number, timezone: string): string {
  return formatEpoch(ms, { timeZone: timezone, mode: "datetime", withZone: true });
}

const DATE_ONLY_PRESETS = {
  long: { year: "numeric", month: "short", day: "numeric" },
  short: { month: "short", day: "numeric" },
  weekday: { weekday: "short", year: "numeric", month: "short", day: "numeric" },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

/**
 * Render a calendar date (`YYYY-MM-DD`) from a Postgres `date` column.
 *
 * Zone-free by construction: a `date` has no instant, so there is nothing to convert. The
 * internal `timeZone: "UTC"` pins the output to the calendar date and is deliberately NOT a
 * parameter — passing the app timezone here would shift the day (rendering 2026-07-16 in
 * America/Toronto yields "Jul 15, 8:00 PM").
 */
export function formatDateOnly(
  iso: string,
  opts: { mode?: keyof typeof DATE_ONLY_PRESETS; locale?: string } = {},
): string {
  // See formatEpoch's comment: a fixed default locale avoids a server-vs-client Intl mismatch.
  const { mode = "long", locale = "en-US" } = opts;
  return new Intl.DateTimeFormat(locale, {
    ...DATE_ONLY_PRESETS[mode],
    timeZone: "UTC",
  }).format(parseIsoDateUtc(iso));
}
