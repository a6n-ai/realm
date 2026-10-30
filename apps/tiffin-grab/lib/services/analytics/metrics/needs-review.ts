import "server-only";
import { and, desc, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { ledgerEntries, orders, payments } from "@/db/schema";
import { CAPTURED, methodWhere, moneyDate } from "./money";
import { dateWhere, ordersScope, type AnalyticsScope } from "./scope";

export type ReviewReason = "cancelled_paid" | "paid_ne_total" | "partly_refunded" | "refunded_no_ledger";

export const REVIEW_REASON_LABEL: Record<ReviewReason, string> = {
  cancelled_paid: "Cancelled but money kept",
  paid_ne_total: "Paid amount differs from order total",
  partly_refunded: "Partly refunded",
  refunded_no_ledger: "Payment marked refunded with no ledger refund",
};

export type NeedsReviewRow = {
  orderPublicId: string;
  deploymentId: string;
  fullName: string;
  status: string;
  /** Every captured payment on the order, plan and add-on (refunded ones included). */
  paid: number;
  /** pricing_snapshot.total, which already includes applied add-ons. */
  total: number;
  /** kept minus total: the comparison paid_ne_total makes. */
  diff: number;
  /** paid minus ledger refunds (paid basis) minus legacy no-ledger refunds: the money the business still holds. */
  kept: number;
  reasons: ReviewReason[];
};

const mine = sql`${payments.orderId} = ${orders.id}`;
const captured = sql`${payments.status} in (${sql.join(CAPTURED.map((s) => sql`${s}`), sql`, `)})`;
const paid = sql`(select coalesce(sum(${payments.amount}), 0) from ${payments} where ${mine} and ${captured})`;
// Ledger refund rows are on the charged basis (amount + surcharge); scale to the paid basis per payment.
const refunds = sql`(select coalesce(sum(${ledgerEntries.amount} * coalesce(${payments.amount} / nullif(${payments.amount} + ${payments.surchargeAmount}, 0), 1)), 0) from ${ledgerEntries} left join ${payments} on ${payments.id} = ${ledgerEntries.paymentId} where ${ledgerEntries.type} = 'refund' and (${ledgerEntries.orderId} = ${orders.id} or ${payments.orderId} = ${orders.id}))`;
const total = sql`(${orders.pricingSnapshot}->>'total')::numeric`;
const noLedgerRefund = sql`not exists (select 1 from ${ledgerEntries} where ${ledgerEntries.paymentId} = ${payments.id} and ${ledgerEntries.type} = 'refund')`;
// Refunded payments with no ledger row: their money left, the ledger just never said so.
const legacyRefunded = sql`(select coalesce(sum(${payments.amount}), 0) from ${payments} where ${mine} and ${payments.status} = 'refunded' and ${noLedgerRefund})`;
// Legacy refunds count as money gone, so a cancelled order whose only refund is one shows just refunded_no_ledger.
const kept = sql`(${paid} - ${refunds} - ${legacyRefunded})`;
const cancelledPaid = sql`(${orders.status} = 'cancelled' and ${kept} > 0.01)`;
const partlyRefunded = sql`(${refunds} > 0.01 and ${kept} > 0.01)`;
// Compared before refunds, so a partial refund never hides a paid/total gap (and is reported by itself).
const paidNeTotal = sql`(${kept} > 0.01 and abs((${paid} - ${legacyRefunded}) - ${total}) > 0.01)`;
const refundedNoLedger = sql`exists (select 1 from ${payments} where ${mine} and ${payments.status} = 'refunded' and not exists (select 1 from ${ledgerEntries} where ${ledgerEntries.paymentId} = ${payments.id} and ${ledgerEntries.type} = 'refund'))`;

/**
 * Orders whose money looks wrong. Dated by capture: an order qualifies when one of its captured
 * payments falls in the window; the figures then cover all of that order's payments.
 */
export async function needsReviewRows(scope: AnalyticsScope): Promise<NeedsReviewRow[]> {
  if (scope.orgIds !== "all" && scope.orgIds.length === 0) return [];
  const inWindow = sql`exists (select 1 from ${payments} where ${mine} and ${captured} and ${and(methodWhere(scope), dateWhere(moneyDate, scope)) ?? sql`true`})`;
  const rows = await db
    .select({
      orderPublicId: orders.publicId,
      deploymentId: orders.deploymentId,
      fullName: orders.fullName,
      status: sql<string>`${orders.status}::text`,
      paid: sql<string>`round(${paid}, 2)::text`,
      total: sql<string | null>`round(${total}, 2)::text`,
      diff: sql<string>`round(${kept} - coalesce(${total}, 0), 2)::text`,
      kept: sql<string>`round(${kept}, 2)::text`,
      isCancelledPaid: sql<boolean>`${cancelledPaid}`,
      isPaidNeTotal: sql<boolean>`coalesce(${paidNeTotal}, false)`,
      isPartlyRefunded: sql<boolean>`${partlyRefunded}`,
      isRefundedNoLedger: sql<boolean>`${refundedNoLedger}`,
    })
    .from(orders)
    .where(and(ordersScope(scope), inWindow, or(cancelledPaid, paidNeTotal, partlyRefunded, refundedNoLedger)))
    .orderBy(desc(orders.createdAt));
  return rows.map((r) => {
    const reasons: ReviewReason[] = [];
    if (r.isCancelledPaid) reasons.push("cancelled_paid");
    if (r.isPaidNeTotal) reasons.push("paid_ne_total");
    if (r.isPartlyRefunded) reasons.push("partly_refunded");
    if (r.isRefundedNoLedger) reasons.push("refunded_no_ledger");
    return {
      orderPublicId: r.orderPublicId, deploymentId: r.deploymentId, fullName: r.fullName, status: r.status,
      paid: Number(r.paid), total: Number(r.total ?? 0), diff: Number(r.diff), kept: Number(r.kept), reasons,
    };
  });
}
