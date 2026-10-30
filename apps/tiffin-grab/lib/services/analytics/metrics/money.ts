import "server-only";
import { and, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { ledgerEntries, mealSizes, orders, payments, plans } from "@/db/schema";
import { SETTLED_STATUSES } from "@/lib/analytics/revenue";
import { dateWhere, localDay, ordersScope, type AnalyticsScope } from "./scope";

export const SETTLED = SETTLED_STATUSES;
type PaymentStatus = (typeof payments.status.enumValues)[number];
// A full refund flips the payment to 'refunded' and also writes a ledger refund row. Revenue counts
// every captured payment and subtracts the ledger, so a refunded payment must stay in the gross side
// or its refund would be deducted from nothing.
export const CAPTURED: PaymentStatus[] = [...SETTLED_STATUSES, "refunded"];

/** The date money moved: capture, else row creation (same fallback the payments list uses). */
export const moneyDate = sql`coalesce(${payments.capturedAt}, ${payments.createdAt})`;

// applyAddons rewrites orders.pricing_snapshot so its total/taxTotal include every applied add-on, and
// records what it applied in snapshot.appliedAddons (same statement, so it is exact for partial applies;
// a not-applied or refunded-all add-on payment leaves both untouched). A plan payment's own quote is the
// snapshot minus that record. An add-on payment uses its addon_request quote.
// ponytail: orders whose add-ons were applied before appliedAddons existed have no record, so their plan quote
// keeps the add-on inside it (same small tax-split error); a one-off backfill of appliedAddons fixes them.
// Staff non-Stripe add-on payments carry no addon_request, so they use the plan quote (total right, per-bucket tax split slightly off).
const appliedAddon = (key: "taxTotal" | "amountDue") => sql`coalesce((${orders.pricingSnapshot}->'appliedAddons'->>${sql.raw(`'${key}'`)})::numeric, 0)`;
const quoteTax = sql`(case when ${payments.addonRequest} is not null then (${payments.addonRequest}->>'taxTotal')::numeric else (${orders.pricingSnapshot}->>'taxTotal')::numeric - ${appliedAddon("taxTotal")} end)`;
const quoteTotal = sql`(case when ${payments.addonRequest} is not null then (${payments.addonRequest}->>'amountDue')::numeric else (${orders.pricingSnapshot}->>'total')::numeric - ${appliedAddon("amountDue")} end)`;
/** Share of a payment that is tax. Missing tax is tax-free; a zero or missing quote total yields null (contributes 0). */
const taxShare = sql`(coalesce(${quoteTax}, 0) / nullif(${quoteTotal}, 0))`;

/** Payment amount without tax. `amount` already excludes the card surcharge, which is stored separately. */
export function netExTax(): SQL {
  return sql`coalesce(${payments.amount} * (1 - ${taxShare}), 0)`;
}

// Every ledger refund row is on the charged basis (amount + surcharge): Stripe's row and the staff
// refund both write it. Revenue excludes the surcharge, so a refund row reduces revenue by
// refund x amount/(amount+surcharge) x (1 - tax/total), all from the refunded payment's own quote.
const refundExSurcharge = sql`coalesce(${ledgerEntries.amount} * (${payments.amount} / nullif(${payments.amount} + ${payments.surchargeAmount}, 0)), 0)`;
const refundExTax = sql`coalesce(${refundExSurcharge} * (1 - ${taxShare}), 0)`;

const sqlList = (v: readonly string[]) => sql.join(v.map((s) => sql`${s}`), sql`, `);
const noOrgs = (scope: AnalyticsScope) => scope.orgIds !== "all" && scope.orgIds.length === 0;
const rowsOf = (r: unknown) => (Array.isArray(r) ? r : ((r as { rows: unknown[] }).rows ?? [])) as Record<string, string | null>[];
// Payment-method facet (scope.extra.method); unknown values match nothing.
export const methodWhere = (scope: AnalyticsScope) => (scope.extra.method?.length ? sql`${payments.method}::text in (${sqlList(scope.extra.method)})` : undefined);
const n2 = (v: string | null | undefined) => Number(v ?? 0);

// One row per captured payment and per ledger refund in scope; callers aggregate and round in SQL,
// so money is never subtracted as floats in JS. Keys are computed per row (no group-by parameter match).
function moneyRows(scope: AnalyticsScope, payKey: SQL, refKey: SQL): SQL {
  return sql`
    select ${payKey} as key, ${payments.amount} as gross, ${netExTax()} as net, ${payments.surchargeAmount} as surcharge,
      0::numeric as refunds, 0::numeric as refund_ex_sur, 0::numeric as refund_ex, 1 as pay_cnt,
      (case when ${payments.status} = 'refunded' and not exists (select 1 from ${ledgerEntries} where ${ledgerEntries.paymentId} = ${payments.id} and ${ledgerEntries.type} = 'refund') then 1 else 0 end) as legacy
    from ${payments} inner join ${orders} on ${orders.id} = ${payments.orderId}
    where ${and(ordersScope(scope), methodWhere(scope), inArray(payments.status, CAPTURED), dateWhere(moneyDate, scope)) ?? sql`true`}
    union all
    select ${refKey}, 0::numeric, 0::numeric, 0::numeric, ${ledgerEntries.amount}, ${refundExSurcharge}, ${refundExTax}, 0, 0
    from ${ledgerEntries} inner join ${payments} on ${payments.id} = ${ledgerEntries.paymentId} inner join ${orders} on ${orders.id} = ${payments.orderId}
    where ${and(ordersScope(scope), methodWhere(scope), sql`${ledgerEntries.type} = 'refund'`, dateWhere(ledgerEntries.createdAt, scope)) ?? sql`true`}`;
}

export type RevenueTotals = {
  gross: number;
  /** Tax still held on the net-of-refunds amount. */
  tax: number;
  net: number;
  refunds: number;
  refundsExTax: number;
  surcharge: number;
  payments: number;
  /** Refund ledger rows in the window that cannot be tied to a payment, scoped through their order when they have one. */
  unlinkedRefunds: number;
  /** Refunded payments with no ledger refund row (refunded before the ledger wrote them): counted as revenue, not deducted. */
  refundedWithoutLedger: number;
};

const ZERO: RevenueTotals = { gross: 0, tax: 0, net: 0, refunds: 0, refundsExTax: 0, surcharge: 0, payments: 0, unlinkedRefunds: 0, refundedWithoutLedger: 0 };

export async function revenueTotals(scope: AnalyticsScope): Promise<RevenueTotals> {
  if (noOrgs(scope)) return ZERO;
  const key = sql`'all'`;
  const inScopeOrder = db.select({ id: orders.id }).from(orders).where(ordersScope(scope));
  const [totals, unlinked] = await Promise.all([
    db.execute(sql`
      with u as (${moneyRows(scope, key, key)})
      select round(coalesce(sum(gross), 0), 2)::text as gross,
        round(coalesce(sum(net) - sum(refund_ex), 0), 2)::text as net,
        round(coalesce((sum(gross) - sum(refund_ex_sur)) - (sum(net) - sum(refund_ex)), 0), 2)::text as tax,
        round(coalesce(sum(refunds), 0), 2)::text as refunds,
        round(coalesce(sum(refund_ex), 0), 2)::text as refunds_ex_tax,
        round(coalesce(sum(surcharge), 0), 2)::text as surcharge,
        coalesce(sum(pay_cnt), 0)::int::text as payments,
        coalesce(sum(legacy), 0)::int::text as legacy
      from u`),
    db.execute(sql`
      select count(*)::int::text as n from ${ledgerEntries}
      where ${ledgerEntries.type} = 'refund' and ${ledgerEntries.paymentId} is null and ${dateWhere(ledgerEntries.createdAt, scope) ?? sql`true`}
        and (${ledgerEntries.orderId} in (${inScopeOrder}) ${scope.orgIds === "all" ? sql`or ${ledgerEntries.orderId} is null` : sql``})`),
  ]);
  const t = rowsOf(totals)[0];
  return {
    gross: n2(t.gross),
    tax: n2(t.tax),
    net: n2(t.net),
    refunds: n2(t.refunds),
    refundsExTax: n2(t.refunds_ex_tax),
    surcharge: n2(t.surcharge),
    payments: n2(t.payments),
    unlinkedRefunds: n2(rowsOf(unlinked)[0].n),
    refundedWithoutLedger: n2(t.legacy),
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

/** Per-bucket totals. Refunds land in the refund's own day (dim "day") or its order's bucket (other dims). */
export async function revenueBy(scope: AnalyticsScope, dim: RevenueDim): Promise<RevenueBucket[]> {
  if (noOrgs(scope)) return [];
  const rows = rowsOf(
    await db.execute(sql`
      with u as (${moneyRows(scope, bucketKey(dim, scope.tz, moneyDate), bucketKey(dim, scope.tz, ledgerEntries.createdAt))})
      select coalesce(key, 'unknown') as key, round(sum(gross), 2)::text as gross, round(sum(net) - sum(refund_ex), 2)::text as net,
        round(sum(refund_ex), 2)::text as refunds_ex_tax, sum(pay_cnt)::int::text as payments
      from u group by key order by key`),
  );
  return rows.map((r) => ({ key: String(r.key), gross: n2(r.gross), net: n2(r.net), refundsExTax: n2(r.refunds_ex_tax), payments: n2(r.payments) }));
}

export type PaymentStatusRow = { status: string; count: number; amount: number };

/** Every payment status in the window, dated like revenueTotals (capture date, else creation). */
export async function paymentsByStatus(scope: AnalyticsScope): Promise<PaymentStatusRow[]> {
  if (noOrgs(scope)) return [];
  const rows = rowsOf(
    await db.execute(sql`
      select ${payments.status}::text as status, count(*)::int::text as count, round(coalesce(sum(${payments.amount}), 0), 2)::text as amount
      from ${payments} inner join ${orders} on ${orders.id} = ${payments.orderId}
      where ${and(ordersScope(scope), methodWhere(scope), dateWhere(moneyDate, scope)) ?? sql`true`}
      group by ${payments.status}`),
  );
  return rows.map((r) => ({ status: String(r.status), count: n2(r.count), amount: n2(r.amount) }));
}
