// What makes a delivery "missed", shared by the Missed deliveries tab and the Orders list facet.
// Its own module because orders.service can't import missed-deliveries.service (that pulls in
// deliveries.service, which already imports orders.service).
import { and, eq, exists, gt, inArray, isNull, lt, ne, notExists, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { deliveries, orders } from "@/db/schema";

const compensation = alias(deliveries, "compensation");

/** Order statuses whose past days can still be owed. A cancelled plan's days are void. */
const OWED_ORDER_STATUSES = ["active", "paused", "completed"] as const;

/** Needs `deliveries` and `orders` in scope (joined, or `orders` from an outer query). */
export function missedWhere(today: string, visible: "all" | string[]): SQL {
  return and(
    eq(deliveries.status, "scheduled"),
    lt(deliveries.deliveryDate, today),
    or(isNull(deliveries.optimoCompletionStatus), ne(deliveries.optimoCompletionStatus, "success")),
    gt(deliveries.tiffinUnits, 0),
    isNull(deliveries.mergedIntoDeliveryId),
    inArray(orders.status, [...OWED_ORDER_STATUSES]),
    notExists(db.select({ _: sql`1` }).from(compensation).where(eq(compensation.complimentaryForDeliveryId, deliveries.id))),
    visible === "all" ? undefined : inArray(orders.organizationId, visible),
  )!;
}

/** Orders with at least one missed delivery; correlates on the outer `orders` row. */
export function hasMissedDeliveries(today: string): SQL {
  return exists(db.select({ _: sql`1` }).from(deliveries).where(and(eq(deliveries.orderId, orders.id), missedWhere(today, "all"))));
}
