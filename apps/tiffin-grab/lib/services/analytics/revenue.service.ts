import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { couponRedemptions, coupons, orders, payments } from "@/db/schema";
import { eachDateInclusive, isoDateInZone, periodKey, round2 } from "@/lib/analytics/profitability";
import { chartPeriod } from "@/lib/analytics/buckets";
import { clampToToday } from "@/lib/analytics/clamp";
import {
  PENDING_STATUSES,
  grainForRange,
  methodLabel,
  presentPaymentStatuses,
  summarizeDiscounts,
  type PaymentStatusSlice,
  type RevenueSummary,
} from "@/lib/analytics/revenue";
import {
  REVENUE_COHORT_COLOR,
  REVENUE_COHORT_LABEL,
  REVENUE_COHORT_ORDER,
  type RevenueCohortKey,
  type RevenueCohortSlice,
} from "@/lib/analytics/revenue-cohorts";
import { SETTLED, freeTiffins, methodWhere, moneyDate, paymentsByStatus, revenueBy, revenueTotals } from "./metrics/money";
import { dateWhere, ordersScope, type AnalyticsScope } from "./metrics/scope";

export type { RevenueSummary, PaymentStatusSlice, RevenueCohortSlice };

/** `daily` is net revenue per calendar day whatever the trend's grain, for the calendar. */
export type RevenueReport = RevenueSummary & {
  byStatus: PaymentStatusSlice[];
  daily: { iso: string; net: number }[];
  /** Value given away as complimentary tiffins; beside revenue, not in it. */
  free: Awaited<ReturnType<typeof freeTiffins>>;
};

export const REVENUE_METHODS = payments.method.enumValues;

/** One row per order with a settled payment in the window: its paid amount and snapshot, for discount lines. */
async function settledOrderRows(scope: AnalyticsScope) {
  if (scope.orgIds !== "all" && scope.orgIds.length === 0) return [];
  const rows = await db
    .select({
      orderId: orders.id,
      amount: sql<string>`sum(${payments.amount})`,
      orderTotal: orders.total,
      snapshot: orders.pricingSnapshot,
      staffCodes: sql<string[] | null>`(
        select array_agg(${coupons.code}) from ${couponRedemptions} inner join ${coupons} on ${coupons.id} = ${couponRedemptions.couponId}
        where ${couponRedemptions.orderId} = ${orders.id} and ${coupons.kind} in ('rep_daily', 'rep_code'))`,
    })
    .from(payments)
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .where(and(ordersScope(scope), methodWhere(scope), inArray(payments.status, [...SETTLED]), dateWhere(moneyDate, scope)))
    .groupBy(orders.id);
  return rows.map((r) => ({
    orderId: String(r.orderId),
    amount: Number(r.amount),
    orderTotal: Number(r.orderTotal),
    snapshot: r.snapshot,
    staffCodes: Array.isArray(r.staffCodes) ? r.staffCodes : [],
  }));
}

export async function getRevenueReport(scope: AnalyticsScope, now = Date.now()): Promise<RevenueReport> {
  const from = isoDateInZone(scope.fromMs, scope.tz);
  const to = isoDateInZone(scope.toMs, scope.tz);
  const grain = grainForRange(from, to);
  const [totals, days, statusRows, methods, orderRows, free] = await Promise.all([
    revenueTotals(scope),
    revenueBy(scope, "day"),
    paymentsByStatus(scope),
    revenueBy(scope, "method"),
    settledOrderRows(scope),
    freeTiffins(scope, now),
  ]);

  const buckets = new Map<string, { netSales: number; collected: number }>();
  const shown = clampToToday({ from, to }, scope.tz, now);
  for (const day of shown ? eachDateInclusive(shown.from, shown.to) : []) buckets.set(periodKey(day, grain), { netSales: 0, collected: 0 });
  for (const d of days) {
    const b = buckets.get(periodKey(d.key, grain));
    if (!b) continue;
    b.netSales += d.net;
    b.collected += d.gross;
  }

  const disc = summarizeDiscounts(orderRows);
  const pending = statusRows.filter((r) => (PENDING_STATUSES as readonly string[]).includes(r.status));

  return {
    from,
    to,
    grain,
    kpis: {
      gross: totals.gross,
      netRevenue: totals.net,
      tax: totals.tax,
      refunds: totals.refunds,
      refundsExSurcharge: totals.refundsExSurcharge,
      unlinkedRefunds: totals.unlinkedRefunds,
      surcharge: totals.surcharge,
      netCollected: round2(totals.gross - totals.refundsExSurcharge),
      payments: totals.payments,
      orders: disc.orders,
      avgOrderValue: disc.orders > 0 ? round2(totals.net / disc.orders) : null,
      listPrice: disc.listPrice,
      discounts: disc.discounts,
      discountRatePct: disc.listPrice > 0 ? round2((disc.discounts / disc.listPrice) * 100) : null,
      pendingAmount: round2(pending.reduce((s, r) => s + r.amount, 0)),
      pendingCount: pending.reduce((s, r) => s + r.count, 0),
    },
    trend: [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, b]) => ({ ...chartPeriod(key, grain), netSales: round2(b.netSales), collected: round2(b.collected) })),
    byMethod: methods
      .filter((m) => m.net !== 0)
      .map((m) => ({ method: methodLabel(m.key), key: m.key, amount: m.net }))
      .sort((a, b) => b.amount - a.amount),
    discounts: disc.lines,
    byStatus: presentPaymentStatuses(statusRows),
    daily: days.map((d) => ({ iso: d.key, net: d.net })),
    free,
  };
}

const COHORT_OF: Record<string, RevenueCohortKey> = { renewal: "renewals", new: "new", trial: "trials" };

/** Net revenue split into renewals / new plans / trials for the same scope as {@link getRevenueReport}. */
export async function getRevenueCohortMix(
  scope: AnalyticsScope,
): Promise<{ slices: RevenueCohortSlice[]; totalAmount: number; totalCount: number }> {
  const rows = await revenueBy(scope, "cohort");
  const slices = REVENUE_COHORT_ORDER.map((key) => {
    const mine = rows.filter((r) => COHORT_OF[r.key] === key);
    return {
      key,
      label: REVENUE_COHORT_LABEL[key],
      amount: round2(mine.reduce((s, r) => s + r.net, 0)),
      count: mine.reduce((s, r) => s + r.settledPayments, 0),
      color: REVENUE_COHORT_COLOR[key],
    };
  });
  return {
    slices,
    totalAmount: round2(slices.reduce((s, r) => s + r.amount, 0)),
    totalCount: slices.reduce((s, r) => s + r.count, 0),
  };
}
