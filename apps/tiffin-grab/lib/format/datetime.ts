export function epochToDate(ms: number): Date {
  return new Date(ms);
}

type FormatMode = "date" | "datetime" | "time" | "relative";

const PRESETS: Record<Exclude<FormatMode, "relative">, Intl.DateTimeFormatOptions> = {
  date: { year: "numeric", month: "short", day: "numeric" },
  datetime: { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
  time: { hour: "numeric", minute: "2-digit" },
};

export function formatEpoch(
  ms: number,
  opts: { timeZone?: string; mode?: FormatMode; withZone?: boolean; locale?: string } = {},
): string {
  const { mode = "datetime", timeZone, withZone, locale } = opts;
  if (mode === "relative") {
    const diff = ms - Date.now();
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const mins = Math.round(diff / 60000);
    if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
    const hours = Math.round(mins / 60);
    if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
    return rtf.format(Math.round(hours / 24), "day");
  }
  const presetOpts = PRESETS[mode];
  return new Intl.DateTimeFormat(locale, {
    ...presetOpts,
    timeZone,
    ...(withZone ? { timeZoneName: "short" } : {}),
  }).format(ms);
}

// Labeled datetime in the app/delivery timezone (e.g. "Jul 16, 2026, 6:00 PM EDT").
export function formatDeliveryTime(ms: number, timezone: string): string {
  return formatEpoch(ms, { timeZone: timezone, mode: "datetime", withZone: true });
}
