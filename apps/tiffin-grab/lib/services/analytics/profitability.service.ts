import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orders, payments } from "@/db/schema";
import { getAppSettings, getProfitabilityAssumptions } from "@/lib/services/app-settings.service";
import {
  addMonths,
  decorateDay,
  eachDateInclusive,
  isoDateInZone,
  kpis,
  monthBounds,
  periodLabel,
  rollup,
  type Grain,
  type ProfitabilityAssumptions,
  type ProfitabilityKpis,
  type ProfitRow,
} from "@/lib/analytics/profitability";
import { hasDateFilter, ordersMatchFilters, type AnalyticsFilters } from "./shared-filters";

const PAID_STATUSES = ["simulated_paid", "paid"] as const;

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

const SETTLED = sql`exists (
  select 1 from ${payments} where ${payments.orderId} = ${orders.id}
  and ${payments.status} in ('paid', 'simulated_paid')
)`;
const REFUNDED = sql`exists (
  select 1 from ${payments} where ${payments.orderId} = ${orders.id} and ${payments.status} = 'refunded'
)`;
// Order total net of tax, spread evenly over the plan's tiffins. Pre-tax because
// tax is collected on the government's behalf; it is not the business's revenue.
const PER_TIFFIN = sql`((${orders.total}::numeric - coalesce((${orders.pricingSnapshot}->>'taxTotal')::numeric, 0))
  / nullif(${orders.tiffinCount}, 0))`;

function rangeFor(month: string, grain: Grain): { from: string; to: string } {
  if (grain === "monthly") {
    const start = addMonths(month, -11);
    return { from: `${start}-01`, to: monthBounds(month).to };
  }
  return monthBounds(month);
}

/**
 * Delivered tiffins in the window — same predicate as tiffin-counts.ts
 * `deliveredTiffinCount` (scheduled AND confirmed delivered),
 * re-expressed in SQL so we don't load every row. Revenue is the order total
 * (excluding tax) spread across that order's tiffinCount, then attributed to the
 * delivery DATE, never the payment date.
 *
 * Only orders with a settled payment earn revenue. Orders still awaiting payment
 * are reported as `unpaidRevenue`, and refunded orders earn nothing. Every
 * delivered tiffin still carries its kitchen and driver cost, because that food
 * went out whether or not it was paid for.
 */
export async function getProfitabilityReport(opts: {
  month: string;
  grain: Grain;
  now?: number;
  filters?: AnalyticsFilters;
}): Promise<ProfitabilityReport> {
  const now = opts.now ?? Date.now();
  const grain = opts.grain;
  const month = opts.month;
  const dims = opts.filters ?? { plans: [], mealSizes: [], zones: [] };
  const [{ timezone }, assumptions] = await Promise.all([getAppSettings(), getProfitabilityAssumptions()]);
  // Shared date filter wins over the month/grain nav when set.
  const bounds = hasDateFilter(dims)
    ? {
        from: dims.from != null ? isoDateInZone(dims.from, timezone) : rangeFor(month, grain).from,
        to: dims.to != null ? isoDateInZone(dims.to, timezone) : rangeFor(month, grain).to,
      }
    : rangeFor(month, grain);
  const { from, to } = bounds.from <= bounds.to ? bounds : { from: bounds.to, to: bounds.from };
  const orderWhere = ordersMatchFilters(dims);

  const deliveredWhere = and(
    eq(deliveries.status, "scheduled"),
    eq(deliveries.optimoCompletionStatus, "success"),
    gte(deliveries.deliveryDate, from),
    lte(deliveries.deliveryDate, to),
    orderWhere,
  );

  const pad = 48 * 60 * 60 * 1000;
  const cashFromMs = Date.parse(`${from}T00:00:00.000Z`) - pad;
  const cashToMs = Date.parse(`${to}T23:59:59.999Z`) + pad;

  const [earnedRows, cashPayments, [nextCutoff]] = await Promise.all([
    db
      .select({
        date: deliveries.deliveryDate,
        tiffins: sql<number>`coalesce(sum(${deliveries.tiffinUnits}), 0)::int`,
        revenue: sql<number>`coalesce(sum(case when ${SETTLED}
          then ${deliveries.tiffinUnits}::numeric * ${PER_TIFFIN} end), 0)::float`,
        unpaidRevenue: sql<number>`coalesce(sum(case when not ${SETTLED} and not ${REFUNDED}
          then ${deliveries.tiffinUnits}::numeric * ${PER_TIFFIN} end), 0)::float`,
      })
      .from(deliveries)
      .innerJoin(orders, eq(deliveries.orderId, orders.id))
      .where(deliveredWhere)
      .groupBy(deliveries.deliveryDate),
    db
      .select({
        capturedAt: payments.capturedAt,
        createdAt: payments.createdAt,
        amount: payments.amount,
      })
      .from(payments)
      .innerJoin(orders, eq(payments.orderId, orders.id))
      .where(
        and(
          inArray(payments.status, PAID_STATUSES),
          sql`coalesce(${payments.capturedAt}, ${payments.createdAt}) >= ${cashFromMs}`,
          sql`coalesce(${payments.capturedAt}, ${payments.createdAt}) <= ${cashToMs}`,
          orderWhere,
        ),
      ),
    db
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
  const cashByDate = new Map<string, number>();
  for (const p of cashPayments) {
    const ms = p.capturedAt ?? p.createdAt;
    if (ms == null) continue;
    const day = isoDateInZone(ms, timezone);
    if (day < from || day > to) continue;
    cashByDate.set(day, (cashByDate.get(day) ?? 0) + Number(p.amount));
  }

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
  const stats = kpis(rows);
  return {
    grain,
    month,
    from,
    to,
    assumptions,
    kpis: stats,
    rows,
    trend: rows.map((r) => ({
      period: periodLabel(r.date, grain),
      profit: r.profit,
      revenue: r.revenue,
    })),
    nextCutoffAt: nextCutoff?.at == null ? null : Number(nextCutoff.at),
  };
}
