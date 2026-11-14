import { isoDateInZone } from "@foundry/commons/util/dates";
import { requestNow } from "@/lib/dates/request-now";
import type { AnalyticsScope } from "@/lib/analytics/scope-types";

// Its own module: calendar-height is also imported by client charts, and the request clock is server-only.
/** The scope's days and today, in its timezone, as CalendarHeatmap takes them. */
export const calendarDays = (scope: Pick<AnalyticsScope, "fromMs" | "toMs" | "tz">) => ({
  from: isoDateInZone(scope.fromMs, scope.tz),
  to: isoDateInZone(scope.toMs, scope.tz),
  today: isoDateInZone(requestNow(), scope.tz),
});
