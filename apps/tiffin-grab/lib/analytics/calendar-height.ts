import { calendarWeeks } from "./calendar";
import { clampToToday } from "./clamp";
import { isoDateInZone } from "./profitability";
import type { AnalyticsScope } from "@/lib/services/analytics/metrics/scope";

/** Header, one row per week and the legend; skeletons use it so the card does not resize on load. */
export const calendarHeight = (from: string, to: string) => 60 + calendarWeeks(from, to).length * 42;

export const calendarSkeletonHeight = (scope: Pick<AnalyticsScope, "fromMs" | "toMs" | "tz">, toDateOnly = true) => {
  const range = { from: isoDateInZone(scope.fromMs, scope.tz), to: isoDateInZone(scope.toMs, scope.tz) };
  const shown = toDateOnly ? clampToToday(range, scope.tz) : range;
  return shown ? calendarHeight(shown.from, shown.to) : 60;
};
