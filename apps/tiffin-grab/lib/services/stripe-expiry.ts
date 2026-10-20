import { and, eq, inArray, isNull, lt, not, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { orderActivities, orders, payments } from "@/db/schema";
import { stripeRuntime } from "@/lib/payments/stripe";
import { createLogger } from "@foundry/commons/logger";
import { cancelOrder } from "./orders.service";

const log = createLogger("stripe-expiry");

/** Cancels a PaymentIntent that can still be paid. "in_flight" means money may be moving or has moved: leave the order alone. */
export async function cancelOpenIntent(piId: string): Promise<"cancelled" | "in_flight" | "none"> {
  const rt = await stripeRuntime();
  if (!rt) return "in_flight";
  let st: string;
  try {
    st = (await rt.stripe.paymentIntents.retrieve(piId)).status;
  } catch (e) {
    log.error({ piId, err: e }, "could not read stripe intent");
    return "in_flight";
  }
  if (st === "canceled") return "none";
  if (st !== "requires_payment_method" && st !== "requires_confirmation" && st !== "requires_action") return "in_flight";
  try {
    await rt.stripe.paymentIntents.cancel(piId);
  } catch (e) {
    log.error({ piId, err: e }, "could not cancel stripe intent");
    return "in_flight";
  }
  return "cancelled";
}

/** Cancels pending, non-migrated orders whose unpaid Stripe payment matches `extra`. Returns how many were cancelled. */
export async function cancelUnpaidStripeOrders(extra: SQL | undefined): Promise<number> {
  const rows = await db
    .select({ id: orders.id, publicId: orders.publicId, providerRef: payments.providerRef })
    .from(orders)
    .innerJoin(payments, eq(payments.orderId, orders.id))
    .where(and(
      eq(orders.status, "pending"),
      not(sql`${orders.deploymentId} like 'wc-%'`),
      eq(payments.method, "stripe"),
      inArray(payments.status, ["awaiting_payment", "rejected"]),
      isNull(payments.addonRequest),
      extra,
    ));
  const seen = new Set<bigint>();
  let cancelled = 0;
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    if (r.providerRef && (await cancelOpenIntent(r.providerRef)) === "in_flight") continue;
    try {
      await cancelOrder(r.publicId);
      await db.insert(orderActivities).values({ orderId: r.id, type: "note", note: "Unpaid card payment expired" });
      cancelled++;
    } catch (e) {
      log.error({ orderId: r.publicId, err: e }, "could not cancel unpaid stripe order");
    }
  }
  return cancelled;
}

export function expireUnpaidStripeOrders(scope: { userId?: bigint; orderId?: bigint }, now = Date.now()): Promise<number> {
  return cancelUnpaidStripeOrders(and(
    lt(payments.expiresAt, now),
    scope.userId != null ? eq(orders.userId, scope.userId) : undefined,
    scope.orderId != null ? eq(orders.id, scope.orderId) : undefined,
  ));
}
