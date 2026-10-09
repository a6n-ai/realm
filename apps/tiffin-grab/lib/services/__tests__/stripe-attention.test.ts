import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { orderActivities, stripeEvents } = await import("@/db/schema");
const { listPayments } = await import("@/app/(dashboard)/dashboard/payments/payment-queries");
const { STRIPE_FACETS } = await import("@/app/(dashboard)/dashboard/payments/payment-facets");
const { makeStripePayment, reset, cleanup } = await import("./stripe-fixture");

describe("Stripe tab attention facets", () => {
  afterAll(cleanup);
  beforeEach(reset);

  it("every facet value runs and matches only the flagged payment", async () => {
    const flagged = await makeStripePayment({ amount: "10.00", piId: "pi_a", paid: true });
    await makeStripePayment({ amount: "10.00", piId: "pi_b", paid: true });
    await db.insert(orderActivities).values({ orderId: flagged.orderId, type: "payment_failed", note: "Stripe amount mismatch for pi_a - x" });
    await db.insert(orderActivities).values({ orderId: flagged.orderId, type: "payment_disputed", note: "Card dispute" });
    await db.insert(stripeEvents).values({ eventId: "evt_x", type: "charge.refunded", paymentId: flagged.id, payload: {}, receivedAt: Date.now(), error: "boom" });
    for (const v of ["failed", "flagged", "disputed", "event_error"]) {
      const { rows } = await listPayments({ attention: v });
      expect(rows.map((r) => r.publicId), v).toEqual([flagged.publicId]);
    }
    expect((await listPayments({ attention: STRIPE_FACETS.map((f) => f.value).join(",") })).total).toBeGreaterThanOrEqual(1);
    expect((await listPayments({ attention: "stuck" })).total).toBe(0);
    await listPayments({ attention: "fallback" });
  });
});
