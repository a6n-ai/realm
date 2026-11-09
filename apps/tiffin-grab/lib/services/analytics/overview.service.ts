import { and, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, payments } from "@/db/schema";
import { clampToToday } from "@/lib/analytics/clamp";
import { ordersDrillHref, zonedRangeMs } from "@/lib/analytics/drill";
import {
  earliestRelevantEnd,
  summarizeTrialConversion,
  TRIAL_CONVERT_WINDOW_DAYS,
  type TrialConversionStats,
} from "@/lib/analytics/trial-conversion";
import { lastTiffinSql, laterPaidOrderBookedAtSql, ordersListWhere } from "@/lib/orders/queries";
import { getComplaintDaily } from "./complaints.service";
import { getProfitabilityReport, type ProfitabilityReport } from "./profitability.service";
import { getSignupDaily } from "./customers.service";
import { revenueBy } from "./metrics/money";
import { scopeToOrdersCondition } from "./metrics/orders";
import { getDeliveriesDaily } from "./operations.service";
import { localDay, ordersScope, type AnalyticsScope } from "./metrics/scope";
import { eachDate, isoDateInZone } from "@foundry/commons/util/dates";

export type { TrialConversionStats };
export { TRIAL_CONVERT_WINDOW_DAYS };

/**
 * Trials decided in range (see `summarizeTrialConversion`). A cancelled trial nobody paid for never
 * ran, so it is not a trial that could convert. "Converted" is the Renewals desk rule
 * (`laterPaidOrderSql`: any later non-trial plan, unpaid and waitlisted included, cancelled never),
 * dated by when that plan was booked.
 */
export async function getTrialToPlanConversion(scope: AnalyticsScope, now = Date.now()): Promise<TrialConversionStats> {
  const from = isoDateInZone(scope.fromMs, scope.tz);
  const to = isoDateInZone(scope.toMs, scope.tz);
  const convertedOn = sql<string | null>`${localDay(laterPaidOrderBookedAtSql, scope.tz)}::text`;
  const rows = await db
    .select({ orderId: orders.id, endDate: sql<string>`${lastTiffinSql}`, convertedOn })
    .from(orders)
    .where(
      and(
        ordersScope(scope),
        isNotNull(orders.trialLength),
        isNotNull(orders.userId),
        sql`not (${orders.status} = 'cancelled' and not exists (
          select 1 from ${payments} where ${payments.orderId} = ${orders.id} and ${payments.status} in ('paid', 'simulated_paid')
        ))`,
        sql`(${lastTiffinSql} between ${earliestRelevantEnd(from)} and ${to} or ${convertedOn} between ${from} and ${to})`,
      ),
    );
  return summarizeTrialConversion({
    fromIso: from,
    toIso: to,
    todayIso: isoDateInZone(now, scope.tz),
    trials: rows.map((r) => ({ orderId: String(r.orderId), endDate: String(r.endDate).slice(0, 10), convertedOn: r.convertedOn })),
  });
}

export type ScorecardRow = {
  date: string;
  revenue: number;
  orders: number;
  deliveries: number;
  skipped: number;
  signups: number;
  complaints: number;
  /** Profitability's profit for the day (WP-migrated tiffins excluded). */
  profit: number | null;
  /** The Orders list for this day, current filters kept. */
  href: string;
};

/** Longer ranges would be hundreds of rows; the card asks for a shorter range instead. */
export const SCORECARD_MAX_DAYS = 92;

async function getOrdersDaily(scope: AnalyticsScope): Promise<{ iso: string; n: number }[]> {
  if (scope.orgIds !== "all" && scope.orgIds.length === 0) return [];
  return db
    .select({ iso: sql<string>`${localDay(orders.createdAt, scope.tz)}::text`, n: sql<number>`cast(count(*) as int)` })
    .from(orders)
    .where(ordersListWhere(scopeToOrdersCondition(scope), scope.orgIds))
    .groupBy(sql`1`);
}

/**
 * One row per calendar day in range, newest first; null when the range is over SCORECARD_MAX_DAYS. Every column reuses its tab's per-day query, so a
 * column's total equals that tab's card for the same URL.
 */
export async function getDailyScorecard(
  scope: AnalyticsScope,
  { now = Date.now(), profit }: { now?: number; profit?: ProfitabilityReport } = {},
): Promise<ScorecardRow[] | null> {
  const from = isoDateInZone(scope.fromMs, scope.tz);
  const to = isoDateInZone(scope.toMs, scope.tz);
  if (eachDate(from, to).length > SCORECARD_MAX_DAYS) return null;
  const [revenue, orderDays, deliveryDays, signups, complaints, profitReport] = await Promise.all([
    revenueBy(scope, "day"),
    getOrdersDaily(scope),
    getDeliveriesDaily(scope),
    getSignupDaily(scope),
    getComplaintDaily(scope),
    profit ?? getProfitabilityReport({ month: from.slice(0, 7), grain: "daily", scope, now }),
  ]);
  const noAccess = scope.orgIds !== "all" && scope.orgIds.length === 0;
  const profitBy = new Map(profitReport.rows.map((r) => [r.date, r.profit]));
  const revenueByDay = new Map(revenue.map((r) => [r.key, r.net]));
  const ordersBy = new Map(orderDays.map((r) => [r.iso, r.n]));
  const deliveriesBy = new Map(deliveryDays.map((r) => [r.iso, r]));
  const signupsBy = new Map(signups.map((r) => [r.iso, r.n]));
  const complaintsBy = new Map(complaints.map((r) => [r.iso, r.n]));
  const shown = clampToToday({ from, to }, scope.tz, now);
  return (shown ? eachDate(shown.from, shown.to) : [])
    .reverse()
    .map((date) => {
      const d = deliveriesBy.get(date);
      const day = zonedRangeMs(date, date, scope.tz);
      return {
        date,
        revenue: revenueByDay.get(date) ?? 0,
        orders: ordersBy.get(date) ?? 0,
        deliveries: d ? d.scheduled + d.paused + d.skipped + d.cancelled : 0,
        skipped: d?.skipped ?? 0,
        signups: signupsBy.get(date) ?? 0,
        complaints: complaintsBy.get(date) ?? 0,
        profit: noAccess ? null : (profitBy.get(date) ?? 0),
        href: ordersDrillHref({ ...scope, fromMs: day.from, toMs: day.to }),
      };
    });
}
