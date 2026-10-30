import { and, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, payments } from "@/db/schema";
import { isoDateInZone } from "@/lib/analytics/profitability";
import {
  summarizeTrialConversion,
  TRIAL_CONVERT_WINDOW_DAYS,
  type TrialConversionStats,
} from "@/lib/analytics/trial-conversion";
import { lastTiffinSql, laterPaidOrderSql } from "@/lib/services/orders.service";
import { ordersScope, type AnalyticsScope } from "./metrics/scope";

export type { TrialConversionStats };
export { TRIAL_CONVERT_WINDOW_DAYS };

/**
 * One row per trial order in scope whose last tiffin falls in the range. A cancelled trial nobody
 * paid for never ran, so it is not a trial that could convert. `converted` is `laterPaidOrderSql`:
 * the Renewals desk rule (any later non-trial plan, unpaid and waitlisted included, cancelled never).
 */
export async function getTrialToPlanConversion(scope: AnalyticsScope, now = Date.now()): Promise<TrialConversionStats> {
  const from = isoDateInZone(scope.fromMs, scope.tz);
  const to = isoDateInZone(scope.toMs, scope.tz);
  const rows = await db
    .select({ orderId: orders.id, endDate: sql<string>`${lastTiffinSql}`, converted: sql<boolean>`${laterPaidOrderSql}` })
    .from(orders)
    .where(
      and(
        ordersScope(scope),
        isNotNull(orders.trialLength),
        isNotNull(orders.userId),
        sql`not (${orders.status} = 'cancelled' and not exists (
          select 1 from ${payments} where ${payments.orderId} = ${orders.id} and ${payments.status} in ('paid', 'simulated_paid')
        ))`,
        sql`${lastTiffinSql} >= ${from}`,
        sql`${lastTiffinSql} <= ${to}`,
      ),
    );
  return summarizeTrialConversion({
    todayIso: isoDateInZone(now, scope.tz),
    trials: rows.map((r) => ({ orderId: String(r.orderId), endDate: String(r.endDate).slice(0, 10), converted: r.converted })),
  });
}
