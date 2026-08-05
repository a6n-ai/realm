import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { coupons, couponRedemptions, payments } from "@/db/schema";

const money = sql<number>`cast(coalesce(sum(${payments.amount}), 0) as float)`;
const PAID_STATUSES = ["simulated_paid", "paid"] as const;

export type RevenueStats = {
  totalRevenue: number;
  refunded: number;
  net: number;
  discountCost: number;
};

export async function getRevenueStats(): Promise<RevenueStats> {
  const [[{ n: totalRevenue }], [{ n: refunded }], [{ n: discountCost }]] = await Promise.all([
    db.select({ n: money }).from(payments).where(inArray(payments.status, PAID_STATUSES)),
    db.select({ n: money }).from(payments).where(eq(payments.status, "refunded")),
    db
      .select({ n: sql<number>`cast(coalesce(sum(${couponRedemptions.amountApplied}), 0) as float)` })
      .from(couponRedemptions),
  ]);
  return { totalRevenue, refunded, net: totalRevenue - refunded, discountCost };
}

// Buckets by capturedAt when the payment actually settled, falling back to
// createdAt for rows still pending/manual so nothing silently drops off the trend.
const dayTrunc = sql<Date>`date_trunc('day', to_timestamp(coalesce(${payments.capturedAt}, ${payments.createdAt}) / 1000.0))`;

export async function getRevenueTrend() {
  const rows = await db
    .select({ day: sql<string>`to_char(${dayTrunc}, 'Mon DD')`, amount: money })
    .from(payments)
    .where(inArray(payments.status, PAID_STATUSES))
    .groupBy(dayTrunc)
    .orderBy(dayTrunc);
  return rows;
}

const METHOD_LABELS: Record<string, string> = {
  simulated: "Simulated",
  cash: "Cash",
  etransfer: "e-Transfer",
  manual: "Manual",
};

export async function getRevenueByMethod() {
  const rows = await db
    .select({ method: payments.method, amount: money })
    .from(payments)
    .where(inArray(payments.status, PAID_STATUSES))
    .groupBy(payments.method);
  return rows.map((r) => ({ method: METHOD_LABELS[r.method] ?? r.method, amount: r.amount }));
}

export type DiscountByKind = { kind: string; amount: number; redemptions: number };

export async function getDiscountByKind(): Promise<DiscountByKind[]> {
  const rows = await db
    .select({
      kind: coupons.kind,
      amount: sql<number>`cast(coalesce(sum(${couponRedemptions.amountApplied}), 0) as float)`,
      redemptions: sql<number>`cast(count(*) as int)`,
    })
    .from(couponRedemptions)
    .innerJoin(coupons, eq(couponRedemptions.couponId, coupons.id))
    .groupBy(coupons.kind);
  return rows;
}
