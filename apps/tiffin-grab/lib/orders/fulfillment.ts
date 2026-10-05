import { and, eq, exists, inArray, not, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, payments } from "@/db/schema";
import { PAYMENT_REVIEW_STATUSES, PAYMENT_SETTLED_STATUSES } from "./display-status";

/**
 * Labels, kitchen packing, and OptimoRoute: only active orders whose money is
 * settled. Payment-review rows stay `orders.status = active` so deliveries can
 * materialize early — this filter keeps them off the truck until verified.
 * A zero-total order has nothing to settle (plans migrated from WordPress were
 * prepaid there and carry no payment row), so it is ready without one.
 */
export function fulfillmentReadyOrder() {
  return and(
    eq(orders.status, "active"),
    or(
      eq(orders.total, "0"),
      exists(
        db
          .select({ _: sql`1` })
          .from(payments)
          .where(and(eq(payments.orderId, orders.id), inArray(payments.status, [...PAYMENT_SETTLED_STATUSES]))),
      ),
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
  nothingOwed = false,
): boolean {
  if (orderStatus !== "active") return false;
  const statuses = paymentStatuses.filter((s): s is string => s != null);
  if (statuses.some((s) => (PAYMENT_REVIEW_STATUSES as readonly string[]).includes(s))) return false;
  return nothingOwed || statuses.some((s) => (PAYMENT_SETTLED_STATUSES as readonly string[]).includes(s));
}
