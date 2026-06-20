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
  opts: { timeZone?: string; mode?: FormatMode } = {},
): string {
  const { mode = "datetime", timeZone } = opts;
  if (mode === "relative") {
    const diff = ms - Date.now();
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    const mins = Math.round(diff / 60000);
    if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
    const hours = Math.round(mins / 60);
    if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
    return rtf.format(Math.round(hours / 24), "day");
  }
  return new Intl.DateTimeFormat(undefined, { ...PRESETS[mode], timeZone }).format(ms);
}
