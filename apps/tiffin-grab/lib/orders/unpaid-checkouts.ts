import { and, eq, gt, isNull, lt, lte, ne, not, or, type SQL } from "drizzle-orm";
import { inStatuses, UNPAID, VOID_EXPIRY } from "@/lib/payments/status";
import { paymentStatusIn, planPaymentSql } from "@/lib/payments/status-sql";
import { wordpressImportSql } from "@/lib/orders/wordpress-import-sql";
import { db } from "@/db/client";
import { orderActivities, orders, payments, users } from "@/db/schema";
import { createLogger } from "@foundry/commons/logger";
import { ValidationError } from "@foundry/commons";
import { ordersService } from "./orders.service";
import { tryChargeLock } from "../payments/stripe-charge";
import { cancelOpenIntent } from "../payments/stripe-expiry";

const log = createLogger("unpaid-checkouts");

/**
 * Cancels pending, non-migrated orders whose unpaid Stripe payment matches `extra`. Returns how many were cancelled.
 * Each row is decided under the payment's charge lock: payByCard holds it while a PI is being created and has no
 * providerRef yet, so a locked row is mid-charge and is skipped.
 */
async function cancelUnpaidStripeOrders(extra: SQL | undefined, note = "Unpaid card payment expired"): Promise<number> {
  const rows = await db
    .select({ id: orders.id, publicId: orders.publicId, payPublicId: payments.publicId })
    .from(orders)
    .innerJoin(payments, eq(payments.orderId, orders.id))
    .where(and(
      eq(orders.status, "pending"),
      not(wordpressImportSql),
      eq(payments.method, "stripe"),
      paymentStatusIn(UNPAID),
      planPaymentSql,
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
        if (!pay || !inStatuses(UNPAID, pay.status) || ord?.status !== "pending") return false;
        if (pay.providerRef && (await cancelOpenIntent(pay.providerRef)) === "in_flight") return false;
        await ordersService.cancel(r.publicId);
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

/** A new card checkout replaces the customer's older unpaid ones. Only older: two near-simultaneous checkouts must not cancel each other. */
export function replaceOlderUnpaidCheckouts(userId: bigint, orderId: bigint): Promise<number> {
  return cancelUnpaidStripeOrders(and(eq(orders.userId, userId), lt(orders.id, orderId)), "Replaced by a new card checkout");
}

/** Before a fresh card order is placed: the older ones hold the customer's coins, so they must go first or the new redemption fails. */
export function cancelUnpaidCheckouts(userId: bigint): Promise<number> {
  return cancelUnpaidStripeOrders(eq(orders.userId, userId), "Replaced by a new card checkout");
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
 * add-on links voided (VOID_EXPIRY). An intent that may be moving money is left alone and
 * noted: if it lands, settle records it on the cancelled order and flags it for a refund.
 */
export async function cancelOrderAndOpenPayments(publicId: string, actorId: bigint | null): Promise<void> {
  await ordersService.cancel(publicId);
  const open = await db
    .select({ publicId: payments.publicId, orderId: payments.orderId, organizationId: payments.organizationId })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(and(
      eq(orders.publicId, publicId),
      eq(payments.method, "stripe"),
      paymentStatusIn(UNPAID),
      or(isNull(payments.expiresAt), ne(payments.expiresAt, VOID_EXPIRY)),
    ));
  for (const p of open) {
    try {
      const closed = await db.transaction(async (tx) => {
        if (!(await tryChargeLock(tx, p.publicId))) return false;
        const [pay] = await tx.select().from(payments).where(eq(payments.publicId, p.publicId)).for("update").limit(1);
        if (!pay || !inStatuses(UNPAID, pay.status)) return true;
        if (pay.providerRef && (await cancelOpenIntent(pay.providerRef)) === "in_flight") return false;
        if (pay.addonRequest) await tx.update(payments).set({ status: "rejected", expiresAt: VOID_EXPIRY, note: "Order cancelled" }).where(eq(payments.id, pay.id));
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

/** A live, unexpired card checkout of this customer's pending order, with the amount it will charge. */
export async function findOpenCardCheckout(paymentPublicId: string, userPublicId: string) {
  const [row] = await db
    .select({ order: orders, amount: payments.amount })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .innerJoin(users, eq(users.id, orders.userId))
    .where(
      and(
        eq(payments.publicId, paymentPublicId),
        eq(payments.method, "stripe"),
        paymentStatusIn(UNPAID),
        planPaymentSql,
        or(isNull(payments.expiresAt), gt(payments.expiresAt, Date.now())),
        eq(orders.status, "pending"),
        eq(users.publicId, userPublicId),
      ),
    )
    .limit(1);
  return row ?? null;
}
