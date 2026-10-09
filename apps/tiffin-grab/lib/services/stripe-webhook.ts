import "server-only";
import { eq } from "drizzle-orm";
import { createLogger } from "@foundry/commons/logger";
import { getWebhookSecret, normalizeEvent, parseStripeEvent, type StripeNormalized } from "@foundry/payments/stripe";
import type Stripe from "stripe";
import { db } from "@/db/client";
import { stripeEvents } from "@/db/schema";
import { touchStripeLastEventAt } from "./app-settings.service";
import { stripeDeps, stripeRuntime } from "@/lib/payments/stripe";
import { findStripePayment, recordStripeDispute, recordStripeFailure, recordStripeRefund, settleStripePayment } from "./payment-stripe";

const log = createLogger("stripe-webhook");

async function dispatch(n: StripeNormalized): Promise<string | null> {
  switch (n.kind) {
    case "paid": {
      const outcome = await settleStripePayment({ paymentRef: n.paymentRef, piId: n.piId }, "webhook", n.eventId);
      return outcome === "paid" || outcome === "already_paid" ? null : outcome;
    }
    case "failed": await recordStripeFailure(n); return null;
    case "refunded": await recordStripeRefund(n); return null;
    case "disputed": await recordStripeDispute(n); return null;
    case "ignored": return null;
  }
}

/** Runs a stored event through the handler. Used by the webhook and by staff "Reprocess". */
export async function processStripeEvent(eventId: string): Promise<void> {
  const [row] = await db.select().from(stripeEvents).where(eq(stripeEvents.eventId, eventId));
  if (!row || row.processedAt) return;
  const n = normalizeEvent(row.payload as unknown as Stripe.Event);
  try {
    const outcome = await dispatch(n);
    const pay = n.kind === "ignored" ? null : await findStripePayment({ paymentRef: "paymentRef" in n ? n.paymentRef : null, piId: n.piId });
    await db.update(stripeEvents).set({ processedAt: Date.now(), error: outcome, paymentId: pay?.id ?? null }).where(eq(stripeEvents.eventId, eventId));
  } catch (e) {
    await db.update(stripeEvents).set({ error: (e as Error).message.slice(0, 500) }).where(eq(stripeEvents.eventId, eventId));
    throw e;
  }
}

export async function handleStripeWebhook(rawBody: string, signature: string | null): Promise<{ status: 200 | 400 | 500; body: string }> {
  if (!signature) return { status: 400, body: "missing signature" };
  const rt = await stripeRuntime();
  if (!rt) return { status: 500, body: "stripe not configured" };
  let secret: string;
  try {
    secret = await getWebhookSecret(stripeDeps);
  } catch {
    log.warn({}, "stripe webhook secret unavailable");
    return { status: 500, body: "stripe not configured" };
  }
  let event: Stripe.Event;
  try {
    ({ event } = await parseStripeEvent(rt.stripe, rawBody, signature, secret));
  } catch {
    log.warn({}, "stripe webhook signature rejected");
    return { status: 400, body: "bad signature" };
  }

  await db.insert(stripeEvents)
    .values({ eventId: event.id, type: event.type, payload: event as unknown as Record<string, unknown>, receivedAt: Date.now() })
    .onConflictDoNothing();
  await touchStripeLastEventAt(Date.now()).catch((e) => log.warn({ err: (e as Error).message }, "stripe lastEventAt update failed"));

  try {
    await processStripeEvent(event.id);
    return { status: 200, body: "ok" };
  } catch (e) {
    log.error({ eventId: event.id, type: event.type, err: (e as Error).message }, "stripe webhook processing failed");
    return { status: 500, body: "processing failed" };
  }
}
