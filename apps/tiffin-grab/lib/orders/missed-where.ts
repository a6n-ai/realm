// What makes a delivery "missed", shared by the Missed deliveries tab and the Orders list facet.
// Its own module because orders.service can't import missed-deliveries.service (that pulls in
// deliveries.service, which already imports orders.service).
import { orgScope, type Visible } from "@/lib/tenant/org-scope";
import { RUNNING_OR_DONE } from "@/lib/orders/status";
import { orderStatusIn } from "@/lib/orders/status-sql";
import { and, eq, exists, gt, isNull, lt, ne, notExists, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { deliveries, orders } from "@/db/schema";

const compensation = alias(deliveries, "compensation");

/** Order statuses whose past days can still be owed. A cancelled plan's days are void. */
/** Needs `deliveries` and `orders` in scope (joined, or `orders` from an outer query). */
export function missedWhere(today: string, visible: Visible): SQL {
  return and(
    eq(deliveries.status, "scheduled"),
    lt(deliveries.deliveryDate, today),
    or(isNull(deliveries.optimoCompletionStatus), ne(deliveries.optimoCompletionStatus, "success")),
    gt(deliveries.tiffinUnits, 0),
    isNull(deliveries.mergedIntoDeliveryId),
    orderStatusIn(RUNNING_OR_DONE),
    notExists(db.select({ _: sql`1` }).from(compensation).where(eq(compensation.complimentaryForDeliveryId, deliveries.id))),
    orgScope(orders.organizationId, visible),
  )!;
}

/** Orders with at least one missed delivery; correlates on the outer `orders` row. */
export function hasMissedDeliveries(today: string): SQL {
  return exists(db.select({ _: sql`1` }).from(deliveries).where(and(eq(deliveries.orderId, orders.id), missedWhere(today, "all"))));
}

/** Public ids of one date's missed deliveries — the Dispatch Day ledger's Needs action for a past day. */
export async function missedPublicIdsOn(date: string, today: string): Promise<Set<string>> {
  const rows = await db
    .select({ publicId: deliveries.publicId })
    .from(deliveries)
    .innerJoin(orders, eq(orders.id, deliveries.orderId))
    .where(and(eq(deliveries.deliveryDate, date), missedWhere(today, "all")));
  return new Set(rows.map((r) => r.publicId));
}
