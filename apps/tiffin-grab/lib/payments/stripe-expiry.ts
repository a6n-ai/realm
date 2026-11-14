import { and, eq, not } from "drizzle-orm";
import { UNPAID } from "@/lib/payments/status";
import { paymentStatusIn, planPaymentSql } from "@/lib/payments/status-sql";
import { wordpressImportSql } from "@/lib/orders/wordpress-import-sql";
import { db } from "@/db/client";
import { orders, payments } from "@/db/schema";
import { stripeRuntime } from "@/lib/payments/stripe";
import { createLogger } from "@foundry/commons/logger";
import { tryChargeLock } from "./stripe-charge";

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
      not(wordpressImportSql),
      eq(payments.method, "stripe"),
      paymentStatusIn(UNPAID),
      planPaymentSql,
    ));
  for (const r of rows) {
    const locked = await db.transaction(async (tx) => !(await tryChargeLock(tx, r.payPublicId)));
    if (locked) return true;
    if (r.providerRef && (await intentState(r.providerRef)) === "in_flight") return true;
  }
  return false;
}
