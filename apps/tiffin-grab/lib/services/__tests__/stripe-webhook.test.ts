import { beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const secret = "whsec_test";
const stripe = new Stripe("sk_test_dummy", { apiVersion: "2026-09-30.endive" });
vi.mock("@/lib/payments/stripe", async (orig) => ({ ...(await orig<object>()), stripeRuntime: async () => ({ stripe, cfg: {} }), stripeDeps: {} }));
const settle = vi.fn(async (..._a: unknown[]) => "paid");
vi.mock("../payment-stripe", async (orig) => ({ ...(await orig<object>()), settleStripePayment: (...a: unknown[]) => settle(...a) }));
vi.mock("@foundry/payments/stripe", async (orig) => ({ ...(await orig<object>()), getWebhookSecret: async () => secret, markStripeEvent: async () => {} }));

const { db } = await import("@/db/client");
const { stripeEvents } = await import("@/db/schema");
const { handleStripeWebhook } = await import("../stripe-webhook");

const body = (id: string) => JSON.stringify({ id, object: "event", type: "payment_intent.succeeded", api_version: "2026-09-30.endive",
  data: { object: { id: "pi_1", object: "payment_intent", status: "succeeded", amount_received: 100, currency: "cad", metadata: { paymentRef: "pay_x" }, created: 1 } } });
const sign = (b: string, s = secret) => stripe.webhooks.generateTestHeaderStringAsync({ payload: b, secret: s });

describe("handleStripeWebhook", () => {
  beforeEach(async () => { await db.delete(stripeEvents); settle.mockClear(); });

  it("400s on a bad signature and stores nothing", async () => {
    const b = body("evt_bad");
    expect((await handleStripeWebhook(b, await sign(b, "whsec_wrong"))).status).toBe(400);
    expect((await handleStripeWebhook(b, null)).status).toBe(400);
    expect(await db.select().from(stripeEvents)).toHaveLength(0);
  });

  it("processes once and dedupes a replay", async () => {
    const b = body("evt_1");
    const h = await sign(b);
    expect((await handleStripeWebhook(b, h)).status).toBe(200);
    expect((await handleStripeWebhook(b, h)).status).toBe(200);
    expect(settle).toHaveBeenCalledTimes(1);
    expect(settle).toHaveBeenCalledWith({ paymentRef: "pay_x", piId: "pi_1" }, "webhook", "evt_1");
    const [row] = await db.select().from(stripeEvents).where(eq(stripeEvents.eventId, "evt_1"));
    expect(row!.processedAt).toBeGreaterThan(0);
  });

  it("500s and records the error when processing throws, then succeeds on retry", async () => {
    settle.mockRejectedValueOnce(new Error("db down"));
    const b = body("evt_2");
    const h = await sign(b);
    expect((await handleStripeWebhook(b, h)).status).toBe(500);
    const [failed] = await db.select().from(stripeEvents).where(eq(stripeEvents.eventId, "evt_2"));
    expect(failed!.error).toContain("db down");
    expect(failed!.processedAt).toBeNull();
    expect((await handleStripeWebhook(b, h)).status).toBe(200);
    expect(settle).toHaveBeenCalledTimes(2);
  });

  it("paid event for a payment whose provider_ref is not yet written still settles by paymentRef", async () => {
    const b = body("evt_3");
    await handleStripeWebhook(b, await sign(b));
    expect(settle.mock.calls[0]![0]).toEqual({ paymentRef: "pay_x", piId: "pi_1" });
  });
});
