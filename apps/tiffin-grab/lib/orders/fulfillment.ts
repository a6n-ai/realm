import { and, eq, exists, inArray, like, not, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, payments } from "@/db/schema";
import { PAYMENT_REVIEW_STATUSES, PAYMENT_SETTLED_STATUSES } from "./display-status";

/**
 * Labels, kitchen packing, and OptimoRoute: only active orders whose money is
 * settled. Payment-review rows stay `orders.status = active` so deliveries can
 * materialize early — this filter keeps them off the truck until verified.
 * A plan migrated from WordPress (deploymentId `wc-…`, total 0) was prepaid there
 * and carries no payment row, so it is ready without one. Only that pair: a
 * zero total reached any other way still needs a settled payment.
 */
export function fulfillmentReadyOrder() {
  return and(
    eq(orders.status, "active"),
    or(
      and(eq(orders.total, "0"), like(orders.deploymentId, "wc-%")),
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
  prepaidOnWordPress = false,
): boolean {
  if (orderStatus !== "active") return false;
  const statuses = paymentStatuses.filter((s): s is string => s != null);
  if (statuses.some((s) => (PAYMENT_REVIEW_STATUSES as readonly string[]).includes(s))) return false;
  return prepaidOnWordPress || statuses.some((s) => (PAYMENT_SETTLED_STATUSES as readonly string[]).includes(s));
}
