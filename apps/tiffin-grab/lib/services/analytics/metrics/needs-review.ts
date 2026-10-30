import "server-only";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { ledgerEntries, orders, payments } from "@/db/schema";
import { round2 } from "@/lib/analytics/profitability";
import { SETTLED_STATUSES } from "@/lib/analytics/revenue";
import { dateWhere, ordersScope, type AnalyticsScope } from "./scope";

export type ReviewReason = "cancelled_paid" | "paid_ne_total";

export const REVIEW_REASON_LABEL: Record<ReviewReason, string> = {
  cancelled_paid: "Cancelled but paid, never refunded",
  paid_ne_total: "Paid amount differs from order total",
};

export type NeedsReviewRow = {
  orderPublicId: string;
  deploymentId: string;
  fullName: string;
  status: string;
  paid: number;
  total: number;
  diff: number;
  reasons: ReviewReason[];
};

const settledPlanPayment = and(
  eq(payments.orderId, orders.id),
  inArray(payments.status, [...SETTLED_STATUSES]),
  sql`${payments.addonRequest} is null`,
);
const paid = sql`(select coalesce(sum(${payments.amount}), 0) from ${payments} where ${settledPlanPayment})`;
const total = sql`(${orders.pricingSnapshot}->>'total')::numeric`;
const cancelledPaid = sql`(${orders.status} = 'cancelled' and ${paid} > 0 and not exists (select 1 from ${ledgerEntries} where ${ledgerEntries.type} = 'refund' and (${ledgerEntries.orderId} = ${orders.id} or ${ledgerEntries.paymentId} in (select ${payments.id} from ${payments} where ${payments.orderId} = ${orders.id}))))`;
const paidNeTotal = sql`(${paid} > 0 and abs(${paid} - ${total}) > 0.01)`;

/**
 * Orders whose money looks wrong. Dated by capture: an order qualifies when a settled plan payment
 * was captured in the window; `paid` then sums all of that order's settled plan payments.
 */
export async function needsReviewRows(scope: AnalyticsScope): Promise<NeedsReviewRow[]> {
  if (scope.orgIds !== "all" && scope.orgIds.length === 0) return [];
  const inWindow = sql`exists (select 1 from ${payments} where ${settledPlanPayment} and ${dateWhere(sql`coalesce(${payments.capturedAt}, ${payments.createdAt})`, scope) ?? sql`true`})`;
  const rows = await db
    .select({
      orderPublicId: orders.publicId,
      deploymentId: orders.deploymentId,
      fullName: orders.fullName,
      status: sql<string>`${orders.status}::text`,
      paid: sql<string>`${paid}`,
      total: sql<string | null>`${total}`,
      isCancelledPaid: sql<boolean>`${cancelledPaid}`,
      isPaidNeTotal: sql<boolean>`coalesce(${paidNeTotal}, false)`,
    })
    .from(orders)
    .where(and(ordersScope(scope), inWindow, or(cancelledPaid, paidNeTotal)))
    .orderBy(desc(orders.createdAt));
  return rows.map((r) => {
    const p = round2(Number(r.paid));
    const t = round2(Number(r.total ?? 0));
    const reasons: ReviewReason[] = [];
    if (r.isCancelledPaid) reasons.push("cancelled_paid");
    if (r.isPaidNeTotal) reasons.push("paid_ne_total");
    return { orderPublicId: r.orderPublicId, deploymentId: r.deploymentId, fullName: r.fullName, status: r.status, paid: p, total: t, diff: round2(p - t), reasons };
  });
}
