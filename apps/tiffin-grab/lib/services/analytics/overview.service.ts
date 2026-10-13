import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orders, payments } from "@/db/schema";
import { isoDateInZone } from "@/lib/analytics/profitability";
import {
  summarizeTrialConversion,
  TRIAL_CONVERT_WINDOW_DAYS,
  type TrialConversionStats,
} from "@/lib/analytics/trial-conversion";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { ordersMatchFilters, type AnalyticsFilters } from "./shared-filters";

export type { TrialConversionStats };
export { TRIAL_CONVERT_WINDOW_DAYS };

function isoDate(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

/**
 * Trials whose last delivery falls in the analytics date range, and how many
 * of those customers started a settled non-trial plan within
 * {@link TRIAL_CONVERT_WINDOW_DAYS} days after that last delivery.
 */
export async function getTrialToPlanConversion(
  filters: AnalyticsFilters,
): Promise<TrialConversionStats> {
  const { timezone } = await getAppSettings();
  if (filters.from == null || filters.to == null) {
    return { eligible: 0, converted: 0, conversionRatePct: null, windowDays: TRIAL_CONVERT_WINDOW_DAYS };
  }
  const from = isoDateInZone(filters.from, timezone);
  const to = isoDateInZone(filters.to, timezone);
  const orderDim = ordersMatchFilters(filters);

  const trialRows = await db
    .select({
      orderId: orders.id,
      userId: orders.userId,
      trialCreatedAt: orders.createdAt,
      endDate: sql<string>`max(${deliveries.deliveryDate})`,
    })
    .from(orders)
    .innerJoin(deliveries, eq(deliveries.orderId, orders.id))
    .where(and(isNotNull(orders.trialLength), isNotNull(orders.userId), orderDim))
    .groupBy(orders.id, orders.userId, orders.createdAt)
    .having(
      and(
        sql`max(${deliveries.deliveryDate}) >= ${from}`,
        sql`max(${deliveries.deliveryDate}) <= ${to}`,
      ),
    );

  if (trialRows.length === 0) {
    return { eligible: 0, converted: 0, conversionRatePct: null, windowDays: TRIAL_CONVERT_WINDOW_DAYS };
  }

  const userIds = [...new Set(trialRows.map((r) => r.userId!).filter((id): id is bigint => id != null))];
  const minCreated = Math.min(...trialRows.map((r) => Number(r.trialCreatedAt)));

  // Settled statuses match SETTLED_STATUSES in lib/analytics/revenue.ts.
  const paidPlanRows =
    userIds.length === 0
      ? []
      : await db
          .select({
            userId: orders.userId,
            createdAt: orders.createdAt,
          })
          .from(orders)
          .where(
            and(
              inArray(orders.userId, userIds),
              isNull(orders.trialLength),
              sql`${orders.createdAt} >= ${minCreated}`,
              sql`exists (
                select 1 from ${payments}
                where ${payments.orderId} = ${orders.id}
                  and ${payments.status} in ('paid', 'simulated_paid')
              )`,
            ),
          );

  return summarizeTrialConversion({
    timezone,
    isoDateInZone,
    trials: trialRows.map((r) => ({
      orderId: String(r.orderId),
      userId: String(r.userId),
      trialCreatedAt: Number(r.trialCreatedAt),
      endDate: isoDate(r.endDate),
    })),
    paidPlans: paidPlanRows
      .filter((r) => r.userId != null)
      .map((r) => ({
        userId: String(r.userId),
        createdAt: Number(r.createdAt),
      })),
  });
}
