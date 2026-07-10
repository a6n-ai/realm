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
    const { locale } = opts;
    const diff = ms - Date.now();
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const mins = Math.round(diff / 60000);
    if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
    const hours = Math.round(mins / 60);
    if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
    return rtf.format(Math.round(hours / 24), "day");
  }
  const { mode = "datetime", timeZone, withZone, locale } = opts;
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
  const { mode = "long", locale } = opts;
  return new Intl.DateTimeFormat(locale, {
    ...DATE_ONLY_PRESETS[mode],
    timeZone: "UTC",
  }).format(parseIsoDateUtc(iso));
}
