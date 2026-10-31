import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, ledgerEntries, orders, payments } from "@/db/schema";
import { getProfitabilityAssumptions } from "@/lib/services/app-settings.service";
import {
  decorateDay,
  eachDateInclusive,
  isoDateInZone,
  kpis,
  round2,
  rollup,
  type Grain,
  type ProfitabilityAssumptions,
  type ProfitabilityKpis,
  type ProfitRow,
} from "@/lib/analytics/profitability";
import { chartPeriod } from "@/lib/analytics/buckets";
import { CAPTURED, netExTax, refundExTax, revenueBy, revenueTotals } from "./metrics/money";
import { ordersScope, type AnalyticsScope } from "./metrics/scope";

function isoDate(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

export type { Grain, ProfitabilityAssumptions, ProfitabilityKpis, ProfitRow };

export type ProfitabilityReport = {
  grain: Grain;
  month: string;
  from: string;
  to: string;
  assumptions: ProfitabilityAssumptions;
  kpis: ProfitabilityKpis;
  rows: ProfitRow[];
  trend: { period: string; profit: number; revenue: number }[];
  /** Next delivery cutoff in range; when it passes, those tiffins count as delivered. */
  nextCutoffAt: number | null;
};

const HAS_CAPTURED = sql`exists (
  select 1 from ${payments} where ${payments.orderId} = ${orders.id}
  and ${inArray(payments.status, CAPTURED)}
)`;
// What the order actually earned: its captured payments ex tax, minus ledger refunds ex tax (the
// same expressions the Revenue tab sums). Not date-limited: it is spread over the order's tiffins.
const CAPTURED_NET = sql`(select coalesce(sum(${netExTax()}), 0) from ${payments}
    where ${payments.orderId} = ${orders.id} and ${inArray(payments.status, CAPTURED)})`;
const ORDER_EARNED = sql`(${CAPTURED_NET}
  - (select coalesce(sum(${refundExTax}), 0) from ${ledgerEntries}
    inner join ${payments} on ${payments.id} = ${ledgerEntries.paymentId}
    where ${payments.orderId} = ${orders.id} and ${ledgerEntries.type} = 'refund'))`;
const EARNED_PER_TIFFIN = sql`(${ORDER_EARNED} / nullif(${orders.tiffinCount}, 0))`;
// Still owed per tiffin: order total ex tax less what was paid ex tax (before refunds). A half-paid
// order owes half; an order nobody paid owes all of it.
const UNPAID_PER_TIFFIN = sql`greatest(
  ((${orders.total}::numeric - coalesce((${orders.pricingSnapshot}->>'taxTotal')::numeric, 0)) - ${CAPTURED_NET})
  / nullif(${orders.tiffinCount}, 0), 0)`;

/**
 * Delivered tiffins in the window — same predicate as tiffin-counts.ts
 * `deliveredTiffinCount` (scheduled AND confirmed delivered),
 * re-expressed in SQL so we don't load every row. Revenue is spread across that
 * order's tiffinCount, then attributed to the delivery DATE, never the payment date.
 *
 * An order earns what it was actually paid ex tax, less refunds (partial payments earn
 * the paid share); the unpaid remainder of an order is reported as `unpaidRevenue`. Every
 * delivered tiffin still carries its kitchen and driver cost, because that food
 * went out whether or not it was paid for.
 */
export async function getProfitabilityReport(opts: {
  month: string;
  grain: Grain;
  now?: number;
  scope: AnalyticsScope;
}): Promise<ProfitabilityReport> {
  const now = opts.now ?? Date.now();
  const grain = opts.grain;
  const month = opts.month;
  const { scope } = opts;
  const assumptions = await getProfitabilityAssumptions();
  const timezone = scope.tz;
  // The page folds the month/grain nav into the scope (navScope), so the scope's range is the one shown.
  const bounds = { from: isoDateInZone(scope.fromMs, timezone), to: isoDateInZone(scope.toMs, timezone) };
  const { from, to } = bounds.from <= bounds.to ? bounds : { from: bounds.to, to: bounds.from };
  const orderWhere = ordersScope(scope);

  const deliveredWhere = and(
    eq(deliveries.status, "scheduled"),
    eq(deliveries.optimoCompletionStatus, "success"),
    gte(deliveries.deliveryDate, from),
    lte(deliveries.deliveryDate, to),
    orderWhere,
  );

  const noOrgs = scope.orgIds !== "all" && scope.orgIds.length === 0;
  const [earnedRows, cashDays, totals, [nextCutoff]] = await Promise.all([
    noOrgs
      ? []
      : db
          .select({
            date: deliveries.deliveryDate,
            tiffins: sql<number>`coalesce(sum(${deliveries.tiffinUnits}), 0)::int`,
            revenue: sql<number>`coalesce(sum(case when ${HAS_CAPTURED}
              then ${deliveries.tiffinUnits}::numeric * ${EARNED_PER_TIFFIN} end), 0)::float`,
            unpaidRevenue: sql<number>`round(coalesce(sum(${deliveries.tiffinUnits}::numeric * ${UNPAID_PER_TIFFIN}), 0), 2)::float`,
          })
          .from(deliveries)
          .innerJoin(orders, eq(deliveries.orderId, orders.id))
          .where(deliveredWhere)
          .groupBy(deliveries.deliveryDate),
    revenueBy(scope, "day"),
    revenueTotals(scope),
    noOrgs
      ? [{ at: null }]
      : db
          .select({ at: sql<number | null>`min(${deliveries.cutoffAt})` })
          .from(deliveries)
          .innerJoin(orders, eq(deliveries.orderId, orders.id))
          .where(
            and(
              eq(deliveries.status, "scheduled"),
              sql`${deliveries.cutoffAt} > ${now}`,
              sql`${deliveries.optimoCompletionStatus} is distinct from 'success'`,
              gte(deliveries.deliveryDate, from),
              lte(deliveries.deliveryDate, to),
              orderWhere,
            ),
          ),
  ]);

  const earnedByDate = new Map(earnedRows.map((r) => [isoDate(r.date), r]));
  // Cash is net collected: gross captured minus refunds on the paid basis, by capture / refund day.
  const cashByDate = new Map(cashDays.map((d) => [d.key, d.gross - d.refundsExSurcharge]));

  const daily = eachDateInclusive(from, to).map((date) =>
    decorateDay(
      {
        date,
        tiffins: earnedByDate.get(date)?.tiffins ?? 0,
        revenue: Number(earnedByDate.get(date)?.revenue ?? 0),
        unpaidRevenue: Number(earnedByDate.get(date)?.unpaidRevenue ?? 0),
        cashCollected: Number(cashByDate.get(date) ?? 0),
      },
      assumptions,
    ),
  );

  const rows = rollup(daily, grain);
  // Equal to the Revenue tab's Net collected by construction, not a sum of rounded days.
  const stats = { ...kpis(rows), cashCollected: round2(totals.gross - totals.refundsExSurcharge) };
  return {
    grain,
    month,
    from,
    to,
    assumptions,
    kpis: stats,
    rows,
    trend: rows.map((r) => ({
      ...chartPeriod(r.date, grain),
      profit: r.profit,
      revenue: r.revenue,
    })),
    nextCutoffAt: nextCutoff?.at == null ? null : Number(nextCutoff.at),
  };
}
