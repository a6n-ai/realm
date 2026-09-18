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
};

function rangeFor(month: string, grain: Grain): { from: string; to: string } {
  if (grain === "monthly") {
    const start = addMonths(month, -11);
    return { from: `${start}-01`, to: monthBounds(month).to };
  }
  return monthBounds(month);
}

/**
 * Delivered tiffins in the window — same predicate as tiffin-counts.ts
 * `deliveredTiffinCount` (scheduled AND (past cutoff OR OptimoRoute confirmed)),
 * re-expressed in SQL so we don't load every row. Revenue is the order TOTAL
 * spread across that order's tiffinCount, then attributed to the delivery DATE,
 * never the payment date.
 */
export async function getProfitabilityReport(opts: {
  month: string;
  grain: Grain;
  now?: number;
}): Promise<ProfitabilityReport> {
  const now = opts.now ?? Date.now();
  const grain = opts.grain;
  const month = opts.month;
  const { from, to } = rangeFor(month, grain);
  const [{ timezone }, assumptions] = await Promise.all([getAppSettings(), getProfitabilityAssumptions()]);

  const deliveredWhere = and(
    eq(deliveries.status, "scheduled"),
    sql`(${deliveries.cutoffAt} <= ${now} or ${deliveries.optimoCompletionStatus} = 'success')`,
    gte(deliveries.deliveryDate, from),
    lte(deliveries.deliveryDate, to),
  );

  const pad = 48 * 60 * 60 * 1000;
  const cashFromMs = Date.parse(`${from}T00:00:00.000Z`) - pad;
  const cashToMs = Date.parse(`${to}T23:59:59.999Z`) + pad;

  const [earnedRows, cashPayments] = await Promise.all([
    db
      .select({
        date: deliveries.deliveryDate,
        tiffins: sql<number>`coalesce(sum(${deliveries.tiffinUnits}), 0)::int`,
        revenue: sql<number>`coalesce(sum(${deliveries.tiffinUnits}::numeric * (${orders.total}::numeric / nullif(${orders.tiffinCount}, 0))), 0)::float`,
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
      .where(
        and(
          inArray(payments.status, PAID_STATUSES),
          sql`coalesce(${payments.capturedAt}, ${payments.createdAt}) >= ${cashFromMs}`,
          sql`coalesce(${payments.capturedAt}, ${payments.createdAt}) <= ${cashToMs}`,
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
  };
}
