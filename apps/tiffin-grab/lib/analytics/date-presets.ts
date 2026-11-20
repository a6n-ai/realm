import { currentMonth, daysInMonth, monthBounds, zonedRangeMs } from "@/lib/dates/epoch-window";
import { addMonths } from "@/lib/analytics/profitability";
import { addDaysIso, isoDateInZone } from "@foundry/commons/util/dates";

export const DATE_PRESETS = [
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "last-7", label: "Last 7 days" },
  { key: "last-14", label: "Last 14 days" },
  { key: "last-30", label: "Last 30 days" },
  { key: "last-3m", label: "Last 3 months" },
  { key: "last-12m", label: "Last 12 months" },
] as const;

export type DatePresetKey = (typeof DATE_PRESETS)[number]["key"];

/** The day after `iso` minus `months`, so 3 months ending Nov 20 start Aug 21 (a month-end day clamps: May 31 minus 3 is Feb 28). */
function monthsWindowStart(iso: string, months: number): string {
  const d = Number(iso.slice(8));
  const target = addMonths(iso.slice(0, 7), -months);
  const [ty, tm] = target.split("-").map(Number) as [number, number];
  return addDaysIso(`${target}-${String(Math.min(d, daysInMonth(ty, tm))).padStart(2, "0")}`, 1);
}

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
      return zonedRangeMs(addDaysIso(today, -6), today, timeZone);
    case "last-14":
      return zonedRangeMs(addDaysIso(today, -13), today, timeZone);
    case "last-3m":
      return zonedRangeMs(monthsWindowStart(today, 3), today, timeZone);
    case "last-12m":
      return zonedRangeMs(monthsWindowStart(today, 12), today, timeZone);
    case "last-30":
      return zonedRangeMs(addDaysIso(today, -29), today, timeZone);
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
