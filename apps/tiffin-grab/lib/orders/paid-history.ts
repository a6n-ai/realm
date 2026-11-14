import { and, eq, or } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import { orders, payments } from "@/db/schema";
import { CAPTURED } from "@/lib/payments/status";
import { paymentStatusIn } from "@/lib/payments/status-sql";
import { wordpressImportSql } from "./wordpress-import-sql";

/** Orders behind the one definition of "not a new customer": ever paid (a refund doesn't make them new again),
 *  or a migrated WordPress customer whose imported orders carry no payment row. An abandoned
 *  checkout or failed card doesn't count. */
export function paidOrders(q: Tx | typeof db, userId: bigint) {
  return q
    .select({ order: orders, payStatus: payments.status })
    .from(orders)
    .leftJoin(payments, eq(payments.orderId, orders.id))
    .where(and(eq(orders.userId, userId), or(paymentStatusIn(CAPTURED), wordpressImportSql)))
    .orderBy(orders.createdAt);
}

export async function hasPaidOrder(q: Tx | typeof db, userId: bigint): Promise<boolean> {
  return (await paidOrders(q, userId).limit(1)).length > 0;
}
