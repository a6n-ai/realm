import "server-only";
import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { ledgerEntries, mealSizes, orders, payments, plans } from "@/db/schema";
import { round2 } from "@/lib/analytics/profitability";
import { SETTLED_STATUSES } from "@/lib/analytics/revenue";
import { dateWhere, localDay, ordersScope, type AnalyticsScope } from "./scope";

export const SETTLED = SETTLED_STATUSES;
// A full refund flips the payment to 'refunded' and also writes a ledger refund row. Revenue counts
// every captured payment and subtracts the ledger, so a refunded payment must stay in the gross side
// or its refund would be deducted from nothing.
const CAPTURED: PaymentStatus[] = [...SETTLED_STATUSES, "refunded"];
type PaymentStatus = (typeof payments.status.enumValues)[number];

/** The date money moved: capture, else row creation (same fallback the payments list uses). */
const moneyDate = sql`coalesce(${payments.capturedAt}, ${payments.createdAt})`;

// The quote a payment settled: an add-on payment carries its own, a plan payment uses the order snapshot.
const quoteTax = sql`(case when ${payments.addonRequest} is not null then ${payments.addonRequest}->>'taxTotal' else ${orders.pricingSnapshot}->>'taxTotal' end)::numeric`;
const quoteTotal = sql`(case when ${payments.addonRequest} is not null then ${payments.addonRequest}->>'amountDue' else ${orders.pricingSnapshot}->>'total' end)::numeric`;
/** Share of a payment that is tax. Missing tax is tax-free; a zero or missing quote total yields null (contributes 0). */
const taxShare = sql`(coalesce(${quoteTax}, 0) / nullif(${quoteTotal}, 0))`;

/** Payment amount without tax. `amount` already excludes the card surcharge, which is stored separately. */
export function netExTax(): SQL {
  return sql`coalesce(${payments.amount} * (1 - ${taxShare}), 0)`;
}

// A ledger refund row (Stripe's includes the surcharge) reduces revenue by its ex-surcharge, ex-tax share:
// refund x amount/(amount+surcharge) x (1 - tax/total), all from the refunded payment's own quote.
const refundExTax = sql`coalesce(${ledgerEntries.amount} * (${payments.amount} / nullif(${payments.amount} + ${payments.surchargeAmount}, 0)) * (1 - ${taxShare}), 0)`;

const paymentWhere = (scope: AnalyticsScope, statuses: PaymentStatus[]) =>
  and(ordersScope(scope), inArray(payments.status, statuses), dateWhere(moneyDate, scope));
// Refunds are scoped only through their payment's order: ledger_entries.organization_id is mostly null.
const refundWhere = (scope: AnalyticsScope) =>
  and(ordersScope(scope), eq(ledgerEntries.type, "refund"), dateWhere(ledgerEntries.createdAt, scope));

const num = (v: unknown) => round2(Number(v ?? 0));
const dec = (e: SQL) => sql<string>`coalesce(sum(${e}), 0)`;

export type RevenueTotals = {
  gross: number;
  tax: number;
  net: number;
  refunds: number;
  refundsExTax: number;
  surcharge: number;
  payments: number;
  /** Refund ledger rows in the window with no payment: cannot be scoped to a franchise, so excluded. */
  unlinkedRefunds: number;
  /** Refunded payments with no ledger refund row (refunded before the ledger wrote them): still counted as revenue. */
  refundedWithoutLedger: number;
};

export async function revenueTotals(scope: AnalyticsScope): Promise<RevenueTotals> {
  if (scope.orgIds !== "all" && scope.orgIds.length === 0) {
    return { gross: 0, tax: 0, net: 0, refunds: 0, refundsExTax: 0, surcharge: 0, payments: 0, unlinkedRefunds: 0, refundedWithoutLedger: 0 };
  }
  const [[p], [r], [u]] = await Promise.all([
    db
      .select({
        gross: dec(sql`${payments.amount}`),
        net: dec(netExTax()),
        surcharge: dec(sql`${payments.surchargeAmount}`),
        payments: sql<number>`cast(count(*) as int)`,
        refundedWithoutLedger: sql<number>`cast(count(*) filter (where ${payments.status} = 'refunded' and not exists (select 1 from ${ledgerEntries} where ${ledgerEntries.paymentId} = ${payments.id} and ${ledgerEntries.type} = 'refund')) as int)`,
      })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .where(paymentWhere(scope, CAPTURED)),
    db
      .select({ refunds: dec(sql`${ledgerEntries.amount}`), refundsExTax: dec(refundExTax) })
      .from(ledgerEntries)
      .innerJoin(payments, eq(payments.id, ledgerEntries.paymentId))
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .where(refundWhere(scope)),
    db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.type, "refund"), isNull(ledgerEntries.paymentId), dateWhere(ledgerEntries.createdAt, scope))),
  ]);
  const gross = num(p.gross);
  const net = round2(Number(p.net) - Number(r.refundsExTax));
  return {
    gross,
    tax: round2(gross - Number(p.net)),
    net,
    refunds: num(r.refunds),
    refundsExTax: num(r.refundsExTax),
    surcharge: num(p.surcharge),
    payments: p.payments,
    unlinkedRefunds: u.n,
    refundedWithoutLedger: p.refundedWithoutLedger,
  };
}

export type RevenueDim = "day" | "method" | "plan" | "mealSize" | "cohort";
export type RevenueBucket = { key: string; gross: number; net: number; refundsExTax: number; payments: number };

// Cohort: trial wins; otherwise renewal when the customer had an earlier non-cancelled order
// (same status set as laterOrderSql); otherwise new.
const cohortSql = sql`(case when ${orders.trialLength} is not null then 'trial' when exists (select 1 from ${orders} as prev_order where prev_order.user_id = ${orders.userId} and prev_order.id <> ${orders.id} and prev_order.status in ('pending', 'waitlisted', 'active', 'paused', 'completed') and (prev_order.created_at < ${orders.createdAt} or (prev_order.created_at = ${orders.createdAt} and prev_order.id < ${orders.id}))) then 'renewal' else 'new' end)`;

function bucketKey(dim: RevenueDim, tz: string, dateCol: SQL | typeof ledgerEntries.createdAt): SQL {
  switch (dim) {
    case "day":
      return sql`${localDay(dateCol, tz)}::text`;
    case "method":
      return sql`${payments.method}::text`;
    case "plan":
      return sql`(select p2.key from ${plans} as p2 where p2.id = ${orders.planId})`;
    case "mealSize":
      return sql`(select m2.key from ${mealSizes} as m2 where m2.id = ${orders.mealSizeId})`;
    case "cohort":
      return cohortSql;
  }
}

// Grouped by ordinal: a bound tz parameter in the select list would not match the same one in group by.
/** Per-bucket totals. Refunds land in the refund's own day (dim "day") or its order's bucket (other dims). */
export async function revenueBy(scope: AnalyticsScope, dim: RevenueDim): Promise<RevenueBucket[]> {
  if (scope.orgIds !== "all" && scope.orgIds.length === 0) return [];
  const payKey = bucketKey(dim, scope.tz, moneyDate);
  const refKey = bucketKey(dim, scope.tz, ledgerEntries.createdAt);
  const [pay, ref] = await Promise.all([
    db
      .select({ key: sql<string>`${payKey}`, gross: dec(sql`${payments.amount}`), net: dec(netExTax()), payments: sql<number>`cast(count(*) as int)` })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .where(paymentWhere(scope, CAPTURED))
      .groupBy(sql`1`),
    db
      .select({ key: sql<string>`${refKey}`, refundsExTax: dec(refundExTax) })
      .from(ledgerEntries)
      .innerJoin(payments, eq(payments.id, ledgerEntries.paymentId))
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .where(refundWhere(scope))
      .groupBy(sql`1`),
  ]);
  const out = new Map<string, RevenueBucket>();
  const slot = (key: string) => {
    let b = out.get(key);
    if (!b) out.set(key, (b = { key, gross: 0, net: 0, refundsExTax: 0, payments: 0 }));
    return b;
  };
  for (const r of pay) Object.assign(slot(r.key ?? "unknown"), { gross: num(r.gross), net: num(r.net), payments: r.payments });
  for (const r of ref) slot(r.key ?? "unknown").refundsExTax = num(r.refundsExTax);
  return [...out.values()]
    .map((b) => ({ ...b, net: round2(b.net - b.refundsExTax) }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export type PaymentStatusRow = { status: string; count: number; amount: number };

/** Every payment status in the window, dated like revenueTotals (capture date, else creation). */
export async function paymentsByStatus(scope: AnalyticsScope): Promise<PaymentStatusRow[]> {
  if (scope.orgIds !== "all" && scope.orgIds.length === 0) return [];
  const rows = await db
    .select({ status: sql<string>`${payments.status}::text`, count: sql<number>`cast(count(*) as int)`, amount: dec(sql`${payments.amount}`) })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(and(ordersScope(scope), dateWhere(moneyDate, scope)))
    .groupBy(payments.status);
  return rows.map((r) => ({ status: r.status, count: r.count, amount: num(r.amount) }));
}
