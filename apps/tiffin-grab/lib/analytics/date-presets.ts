import { zonedRangeMs } from "@/lib/analytics/drill";
import { addMonths, currentMonth, isoDateInZone, monthBounds } from "@/lib/analytics/profitability";

export const DATE_PRESETS = [
  { key: "this-month", label: "This month" },
  { key: "last-7", label: "Last 7 days" },
  { key: "last-30", label: "Last 30 days" },
  { key: "last-month", label: "Last month" },
] as const;

export type DatePresetKey = (typeof DATE_PRESETS)[number]["key"];

const shiftIso = (iso: string, days: number): string => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/** Inclusive epoch-ms window for a preset, on calendar days of `timeZone`. */
export function presetRange(key: DatePresetKey, timeZone: string, now = Date.now()): { from: number; to: number } {
  const today = isoDateInZone(now, timeZone);
  switch (key) {
    case "this-month": {
      const b = monthBounds(currentMonth(timeZone, now));
      return zonedRangeMs(b.from, b.to, timeZone);
    }
    case "last-month": {
      const b = monthBounds(addMonths(currentMonth(timeZone, now), -1));
      return zonedRangeMs(b.from, b.to, timeZone);
    }
    case "last-7":
      return zonedRangeMs(shiftIso(today, -6), today, timeZone);
    case "last-30":
      return zonedRangeMs(shiftIso(today, -29), today, timeZone);
  }
}

/** The preset whose window equals `from`/`to` exactly, or null for a custom range. */
export function activePreset(
  range: { from?: number; to?: number },
  timeZone: string,
  now = Date.now(),
): DatePresetKey | null {
  if (range.from == null || range.to == null) return null;
  return (
    DATE_PRESETS.find((p) => {
      const r = presetRange(p.key, timeZone, now);
      return r.from === range.from && r.to === range.to;
    })?.key ?? null
  );
}
