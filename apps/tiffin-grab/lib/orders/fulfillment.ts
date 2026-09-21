import { and, eq, exists, inArray, not, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, payments } from "@/db/schema";
import { PAYMENT_REVIEW_STATUSES, PAYMENT_SETTLED_STATUSES } from "./display-status";

/**
 * Labels, kitchen packing, and OptimoRoute: only active orders whose money is
 * settled. Payment-review rows stay `orders.status = active` so deliveries can
 * materialize early — this filter keeps them off the truck until verified.
 */
export function fulfillmentReadyOrder() {
  return and(
    eq(orders.status, "active"),
    exists(
      db
        .select({ _: sql`1` })
        .from(payments)
        .where(and(eq(payments.orderId, orders.id), inArray(payments.status, [...PAYMENT_SETTLED_STATUSES]))),
    ),
    not(
      exists(
        db
          .select({ _: sql`1` })
          .from(payments)
          .where(and(eq(payments.orderId, orders.id), inArray(payments.status, [...PAYMENT_REVIEW_STATUSES]))),
      ),
    ),
  );
}

/** Same predicate as a boolean over already-loaded payment statuses (tests / badges). */
export function isFulfillmentReady(
  orderStatus: string,
  paymentStatuses: readonly (string | null | undefined)[],
): boolean {
  if (orderStatus !== "active") return false;
  const statuses = paymentStatuses.filter((s): s is string => s != null);
  if (statuses.some((s) => (PAYMENT_REVIEW_STATUSES as readonly string[]).includes(s))) return false;
  return statuses.some((s) => (PAYMENT_SETTLED_STATUSES as readonly string[]).includes(s));
}
