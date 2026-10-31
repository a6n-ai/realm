import { isoDateInZone } from "./profitability";

/**
 * Trims a calendar range (YYYY-MM-DD, app timezone) so it ends today. Null when the whole range is still ahead.
 * Day-grain views use it so days that have not happened yet are not plotted, averaged or listed as zero.
 */
export function clampToToday(range: { from: string; to: string }, tz: string, now = Date.now()): { from: string; to: string } | null {
  const today = isoDateInZone(now, tz);
  if (range.from > today) return null;
  return { from: range.from, to: range.to < today ? range.to : today };
}
