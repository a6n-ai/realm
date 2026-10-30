import "server-only";
import { and, desc, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { ledgerEntries, orders, payments } from "@/db/schema";
import { CAPTURED, moneyDate } from "./money";
import { dateWhere, ordersScope, type AnalyticsScope } from "./scope";

export type ReviewReason = "cancelled_paid" | "paid_ne_total" | "refunded_no_ledger";

export const REVIEW_REASON_LABEL: Record<ReviewReason, string> = {
  cancelled_paid: "Cancelled but money kept",
  paid_ne_total: "Paid amount differs from order total",
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
  diff: number;
  /** paid minus ledger refunds: the money the business still holds. */
  kept: number;
  reasons: ReviewReason[];
};

const mine = sql`${payments.orderId} = ${orders.id}`;
const captured = sql`${payments.status} in (${sql.join(CAPTURED.map((s) => sql`${s}`), sql`, `)})`;
const paid = sql`(select coalesce(sum(${payments.amount}), 0) from ${payments} where ${mine} and ${captured})`;
const refunds = sql`(select coalesce(sum(${ledgerEntries.amount}), 0) from ${ledgerEntries} where ${ledgerEntries.type} = 'refund' and (${ledgerEntries.orderId} = ${orders.id} or ${ledgerEntries.paymentId} in (select ${payments.id} from ${payments} where ${mine})))`;
const total = sql`(${orders.pricingSnapshot}->>'total')::numeric`;
const cancelledPaid = sql`(${orders.status} = 'cancelled' and ${paid} - ${refunds} > 0.01)`;
const paidNeTotal = sql`(${paid} > 0 and abs(${paid} - ${total}) > 0.01)`;
const refundedNoLedger = sql`exists (select 1 from ${payments} where ${mine} and ${payments.status} = 'refunded' and not exists (select 1 from ${ledgerEntries} where ${ledgerEntries.paymentId} = ${payments.id} and ${ledgerEntries.type} = 'refund'))`;

/**
 * Orders whose money looks wrong. Dated by capture: an order qualifies when one of its captured
 * payments falls in the window; the figures then cover all of that order's payments.
 */
export async function needsReviewRows(scope: AnalyticsScope): Promise<NeedsReviewRow[]> {
  if (scope.orgIds !== "all" && scope.orgIds.length === 0) return [];
  const inWindow = sql`exists (select 1 from ${payments} where ${mine} and ${captured} and ${dateWhere(moneyDate, scope) ?? sql`true`})`;
  const rows = await db
    .select({
      orderPublicId: orders.publicId,
      deploymentId: orders.deploymentId,
      fullName: orders.fullName,
      status: sql<string>`${orders.status}::text`,
      paid: sql<string>`round(${paid}, 2)::text`,
      total: sql<string | null>`round(${total}, 2)::text`,
      diff: sql<string>`round(${paid} - coalesce(${total}, 0), 2)::text`,
      kept: sql<string>`round(${paid} - ${refunds}, 2)::text`,
      isCancelledPaid: sql<boolean>`${cancelledPaid}`,
      isPaidNeTotal: sql<boolean>`coalesce(${paidNeTotal}, false)`,
      isRefundedNoLedger: sql<boolean>`${refundedNoLedger}`,
    })
    .from(orders)
    .where(and(ordersScope(scope), inWindow, or(cancelledPaid, paidNeTotal, refundedNoLedger)))
    .orderBy(desc(orders.createdAt));
  return rows.map((r) => {
    const reasons: ReviewReason[] = [];
    if (r.isCancelledPaid) reasons.push("cancelled_paid");
    if (r.isPaidNeTotal) reasons.push("paid_ne_total");
    if (r.isRefundedNoLedger) reasons.push("refunded_no_ledger");
    return {
      orderPublicId: r.orderPublicId, deploymentId: r.deploymentId, fullName: r.fullName, status: r.status,
      paid: Number(r.paid), total: Number(r.total ?? 0), diff: Number(r.diff), kept: Number(r.kept), reasons,
    };
  });
}
