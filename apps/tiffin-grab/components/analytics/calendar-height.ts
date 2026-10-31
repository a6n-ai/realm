import { isoDateInZone } from "@/lib/analytics/profitability";
import type { AnalyticsScope } from "@/lib/services/analytics/metrics/scope";
import { calendarWeeks } from "./chart-math";

/** Header, one row per week and the legend; skeletons use it so the card does not resize on load. */
export const calendarHeight = (from: string, to: string) => 60 + calendarWeeks(from, to).length * 42;

export const calendarSkeletonHeight = (scope: Pick<AnalyticsScope, "fromMs" | "toMs" | "tz">) =>
  calendarHeight(isoDateInZone(scope.fromMs, scope.tz), isoDateInZone(scope.toMs, scope.tz));
