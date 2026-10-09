import "server-only";
import { eq } from "drizzle-orm";
import { createLogger } from "@foundry/commons/logger";
import { getWebhookSecret, markStripeEvent, normalizeEvent, parseStripeEvent, type StripeNormalized } from "@foundry/payments/stripe";
import type Stripe from "stripe";
import { db } from "@/db/client";
import { stripeEvents } from "@/db/schema";
import { stripeDeps, stripeRuntime } from "@/lib/payments/stripe";
import { findStripePayment, recordStripeDispute, recordStripeFailure, recordStripeRefund, settleStripePayment } from "./payment-stripe";

const log = createLogger("stripe-webhook");

async function dispatch(n: StripeNormalized): Promise<void> {
  switch (n.kind) {
    case "paid": await settleStripePayment({ paymentRef: n.paymentRef, piId: n.piId }, "webhook", n.eventId); return;
    case "failed": await recordStripeFailure(n); return;
    case "refunded": await recordStripeRefund(n); return;
    case "disputed": await recordStripeDispute(n); return;
    case "ignored": return;
  }
}

/** Runs a stored event through the handler. Used by the webhook and by staff "Reprocess". */
export async function processStripeEvent(eventId: string): Promise<void> {
  const [row] = await db.select().from(stripeEvents).where(eq(stripeEvents.eventId, eventId));
  if (!row || row.processedAt) return;
  const n = normalizeEvent(row.payload as unknown as Stripe.Event);
  try {
    await dispatch(n);
    const pay = n.kind === "ignored" ? null : await findStripePayment({ paymentRef: "paymentRef" in n ? n.paymentRef : null, piId: n.piId });
    await db.update(stripeEvents).set({ processedAt: Date.now(), error: null, paymentId: pay?.id ?? null }).where(eq(stripeEvents.eventId, eventId));
  } catch (e) {
    await db.update(stripeEvents).set({ error: (e as Error).message.slice(0, 500) }).where(eq(stripeEvents.eventId, eventId));
    throw e;
  }
}

export async function handleStripeWebhook(rawBody: string, signature: string | null): Promise<{ status: 200 | 400 | 500; body: string }> {
  if (!signature) return { status: 400, body: "missing signature" };
  const rt = await stripeRuntime();
  if (!rt) return { status: 500, body: "stripe not configured" };
  let event: Stripe.Event;
  try {
    ({ event } = await parseStripeEvent(rt.stripe, rawBody, signature, await getWebhookSecret(stripeDeps)));
  } catch {
    log.warn({}, "stripe webhook signature rejected");
    return { status: 400, body: "bad signature" };
  }

  await db.insert(stripeEvents)
    .values({ eventId: event.id, type: event.type, payload: event as unknown as Record<string, unknown>, receivedAt: Date.now() })
    .onConflictDoNothing();
  await markStripeEvent(stripeDeps, Date.now()).catch(() => {});

  try {
    await processStripeEvent(event.id);
    return { status: 200, body: "ok" };
  } catch (e) {
    log.error({ eventId: event.id, type: event.type, err: (e as Error).message }, "stripe webhook processing failed");
    return { status: 500, body: "processing failed" };
  }
}
