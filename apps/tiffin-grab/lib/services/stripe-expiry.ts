import { and, eq, inArray, isNull, lt, lte, ne, not, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { orderActivities, orders, payments } from "@/db/schema";
import { stripeRuntime } from "@/lib/payments/stripe";
import { createLogger } from "@foundry/commons/logger";
import { ValidationError } from "@foundry/commons";
import { cancelOrder } from "./orders.service";
import { tryChargeLock } from "./payment-stripe";

const log = createLogger("stripe-expiry");

/** "none": no intent to worry about. "open": unpaid, so safe to cancel. "in_flight": money may be moving or has moved (or we can't tell). */
async function intentState(piId: string): Promise<"none" | "open" | "in_flight"> {
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
  return st === "requires_payment_method" || st === "requires_confirmation" || st === "requires_action" ? "open" : "in_flight";
}

/** Cancels a PaymentIntent that can still be paid. "in_flight" means money may be moving or has moved: leave the order alone. */
export async function cancelOpenIntent(piId: string): Promise<"cancelled" | "in_flight" | "none"> {
  const st = await intentState(piId);
  if (st !== "open") return st;
  const rt = await stripeRuntime();
  try {
    await rt!.stripe.paymentIntents.cancel(piId);
  } catch (e) {
    log.error({ piId, err: e }, "could not cancel stripe intent");
    return "in_flight";
  }
  return "cancelled";
}

const UNPAID = ["awaiting_payment", "rejected"] as const;

/**
 * Cancels pending, non-migrated orders whose unpaid Stripe payment matches `extra`. Returns how many were cancelled.
 * Each row is decided under the payment's charge lock: payByCard holds it while a PI is being created and has no
 * providerRef yet, so a locked row is mid-charge and is skipped.
 */
export async function cancelUnpaidStripeOrders(extra: SQL | undefined, note = "Unpaid card payment expired"): Promise<number> {
  const rows = await db
    .select({ id: orders.id, publicId: orders.publicId, payPublicId: payments.publicId })
    .from(orders)
    .innerJoin(payments, eq(payments.orderId, orders.id))
    .where(and(
      eq(orders.status, "pending"),
      not(sql`${orders.deploymentId} like 'wc-%'`),
      eq(payments.method, "stripe"),
      inArray(payments.status, [...UNPAID]),
      isNull(payments.addonRequest),
      extra,
    ));
  const seen = new Set<bigint>();
  let cancelled = 0;
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    try {
      const done = await db.transaction(async (tx) => {
        if (!(await tryChargeLock(tx, r.payPublicId))) return false;
        const [pay] = await tx.select({ status: payments.status, providerRef: payments.providerRef }).from(payments).where(eq(payments.publicId, r.payPublicId)).limit(1);
        const [ord] = await tx.select({ status: orders.status }).from(orders).where(eq(orders.id, r.id)).limit(1);
        if (!pay || !(UNPAID as readonly string[]).includes(pay.status) || ord?.status !== "pending") return false;
        if (pay.providerRef && (await cancelOpenIntent(pay.providerRef)) === "in_flight") return false;
        await cancelOrder(r.publicId);
        await tx.insert(orderActivities).values({ orderId: r.id, type: "note", note });
        return true;
      });
      if (done) cancelled++;
    } catch (e) {
      if (e instanceof ValidationError && e.message === "Order is already cancelled") continue;
      log.error({ orderId: r.publicId, err: e }, "could not cancel unpaid stripe order");
    }
  }
  return cancelled;
}

/**
 * True when one of the customer's unpaid card payments is mid-charge (charge lock held) or has an intent
 * that can no longer be cancelled. The replace step would skip such an order, so a new order placed now
 * would be charged alongside it.
 */
export async function hasChargeInFlight(userId: bigint): Promise<boolean> {
  const rows = await db
    .select({ payPublicId: payments.publicId, providerRef: payments.providerRef })
    .from(orders)
    .innerJoin(payments, eq(payments.orderId, orders.id))
    .where(and(
      eq(orders.userId, userId),
      eq(orders.status, "pending"),
      not(sql`${orders.deploymentId} like 'wc-%'`),
      eq(payments.method, "stripe"),
      inArray(payments.status, [...UNPAID]),
      isNull(payments.addonRequest),
    ));
  for (const r of rows) {
    const locked = await db.transaction(async (tx) => !(await tryChargeLock(tx, r.payPublicId)));
    if (locked) return true;
    if (r.providerRef && (await intentState(r.providerRef)) === "in_flight") return true;
  }
  return false;
}

/** A new card checkout replaces the customer's older unpaid ones. Only older: two near-simultaneous checkouts must not cancel each other. */
export function replaceOlderUnpaidCheckouts(userId: bigint, orderId: bigint): Promise<number> {
  return cancelUnpaidStripeOrders(and(eq(orders.userId, userId), lt(orders.id, orderId)), "Replaced by a new card checkout");
}

export function expireUnpaidStripeOrders(scope: { userId?: bigint; orderId?: bigint }, now = Date.now()): Promise<number> {
  return cancelUnpaidStripeOrders(and(
    lte(payments.expiresAt, now),
    scope.userId != null ? eq(orders.userId, scope.userId) : undefined,
    scope.orderId != null ? eq(orders.id, scope.orderId) : undefined,
  ));
}

/**
 * Staff cancel: the order, then every card payment on it that could still be paid. Open intents are cancelled and
 * add-on links voided (expiresAt 0, as order-addons voidLink). An intent that may be moving money is left alone and
 * noted: if it lands, settle records it on the cancelled order and flags it for a refund.
 */
export async function cancelOrderAndOpenPayments(publicId: string, actorId: bigint | null): Promise<void> {
  await cancelOrder(publicId);
  const open = await db
    .select({ publicId: payments.publicId, orderId: payments.orderId, organizationId: payments.organizationId })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(and(
      eq(orders.publicId, publicId),
      eq(payments.method, "stripe"),
      inArray(payments.status, [...UNPAID]),
      or(isNull(payments.expiresAt), ne(payments.expiresAt, 0)),
    ));
  for (const p of open) {
    try {
      const closed = await db.transaction(async (tx) => {
        if (!(await tryChargeLock(tx, p.publicId))) return false;
        const [pay] = await tx.select().from(payments).where(eq(payments.publicId, p.publicId)).for("update").limit(1);
        if (!pay || !(UNPAID as readonly string[]).includes(pay.status)) return true;
        if (pay.providerRef && (await cancelOpenIntent(pay.providerRef)) === "in_flight") return false;
        if (pay.addonRequest) await tx.update(payments).set({ status: "rejected", expiresAt: 0, note: "Order cancelled" }).where(eq(payments.id, pay.id));
        return true;
      });
      if (!closed) {
        await db.insert(orderActivities).values({
          orderId: p.orderId,
          type: "note",
          note: "A card payment on this order may still be going through. Check Stripe and refund it if it lands.",
          createdBy: actorId,
          organizationId: p.organizationId,
        });
      }
    } catch (e) {
      log.error({ orderId: publicId, paymentId: p.publicId, err: e }, "could not close card payment on cancelled order");
    }
  }
}
