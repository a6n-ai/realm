import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { ValidationError } from "@foundry/commons";
import { refundIntent } from "@foundry/payments/stripe";
import { db } from "@/db/client";
import { orderActivities, payments } from "@/db/schema";
import { stripeRuntime } from "@/lib/payments/stripe";
import { fromCents, toCents } from "@/lib/money";
import { resolveUserId } from "@/lib/identity/user-ids";

type Payment = typeof payments.$inferSelect;


/**
 * One charge attempt per payment at a time: tokens differ per submit, so Stripe idempotency alone
 * cannot stop two tabs from creating two PIs. Lock is transaction-scoped, released on any exit.
 * ponytail: each charge holds a pooled connection and needs a second for its queries, so ~pool-size
 * concurrent charges would exhaust the pool; upgrade to a row-claim column (claimed_at) if that matters.
 */
export async function tryChargeLock(tx: Pick<typeof db, "execute">, paymentPublicId: string): Promise<boolean> {
  const got = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtextextended(${"stripe-charge:" + paymentPublicId}, 0)) as ok`);
  return !!(got as unknown as { ok: boolean }[])[0]?.ok;
}

/** What the card was charged: the payment amount plus any surcharge. */
export const chargedCents = (p: Pick<Payment, "amount" | "surchargeAmount">) => toCents(p.amount) + toCents(p.surchargeAmount ?? 0);

/** Asks Stripe to refund; the charge.refunded webhook is the only ledger writer. A null actor is the system. */
export async function refundStripePayment(paymentPublicId: string, amount: string | null, reason: string, actorPublicId: string | null): Promise<void> {
  if (!reason.trim()) throw new ValidationError("Add a reason for the refund");
  if (amount != null && !(Number.isFinite(Number(amount)) && Number(amount) > 0)) throw new ValidationError("Enter a refund amount greater than zero");
  const [pay] = await db.select().from(payments).where(and(eq(payments.publicId, paymentPublicId), eq(payments.method, "stripe"))).limit(1);
  if (!pay?.providerRef || pay.status !== "paid") throw new ValidationError("Only a settled card payment can be refunded");
  const rt = await stripeRuntime();
  if (!rt) throw new ValidationError("Stripe is not connected");
  // Stripe is the authority on what is refundable: the ledger lags until the webhook lands.
  const pi = await rt.stripe.paymentIntents.retrieve(pay.providerRef, { expand: ["latest_charge"] });
  const charge = pi.latest_charge;
  if (!charge || typeof charge === "string") throw new ValidationError("Stripe has no charge to refund for this payment");
  // Our own total caps Stripe's: a charge larger than what we billed is never refundable beyond our amount.
  const remaining = Math.min(chargedCents(pay), charge.amount) - charge.amount_refunded;
  const cents = amount == null ? remaining : toCents(amount);
  if (cents <= 0 || cents > remaining) throw new ValidationError(`Refund must be between 0.01 and ${fromCents(Math.max(remaining, 0))}`);
  await refundIntent(rt.stripe, pay.providerRef, cents, `refund:${pay.publicId}:${cents}:${charge.amount_refunded}`);
  await db.insert(orderActivities).values({
    orderId: pay.orderId,
    type: "note",
    note: `Refund of ${fromCents(cents)} requested in Stripe ${actorPublicId ? "by staff" : "automatically"}: ${reason.trim()} (ledger updates when Stripe confirms)`,
    createdBy: await resolveUserId(db, actorPublicId),
  });
}
