import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const status = vi.fn();
vi.mock("@/lib/payments/stripe", async (orig) => ({
  ...(await orig<object>()),
  stripeRuntime: async () => ({ stripe: {}, cfg: { tax: { enabled: false } } }),
}));
vi.mock("@foundry/payments/stripe", async (orig) => ({ ...(await orig<object>()), fetchIntentStatus: (...a: unknown[]) => status(...a) }));

const { db } = await import("@/db/client");
const { ledgerEntries, orderActivities, payments } = await import("@/db/schema");
const svc = await import("../payment-stripe");
const { makeStripePayment, reset } = await import("./stripe-fixture");

describe("settleStripePayment", () => {
  beforeEach(async () => { await reset(); status.mockReset(); });

  it("settles once with one ledger row when Stripe says succeeded", async () => {
    const pay = await makeStripePayment({ amount: "200.00", surcharge: "4.80", piId: "pi_1" });
    status.mockResolvedValue({ piId: "pi_1", status: "succeeded", amountReceivedCents: 20480, currency: "cad", paymentRef: pay.publicId, created: 1 });
    expect(await svc.settleStripePayment({ paymentRef: pay.publicId }, "webhook", "evt_1")).toBe("paid");
    expect(await svc.settleStripePayment({ paymentRef: pay.publicId }, "view")).toBe("already_paid");
    expect(await db.select().from(ledgerEntries).where(eq(ledgerEntries.paymentId, pay.id))).toHaveLength(1);
  });

  it("refuses an amount mismatch and leaves the row unpaid", async () => {
    const pay = await makeStripePayment({ amount: "200.00", piId: "pi_2" });
    status.mockResolvedValue({ piId: "pi_2", status: "succeeded", amountReceivedCents: 100, currency: "cad", paymentRef: pay.publicId, created: 1 });
    expect(await svc.settleStripePayment({ paymentRef: pay.publicId }, "webhook")).toBe("amount_mismatch");
    const [row] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(row!.status).toBe("awaiting_payment");
    const acts = await db.select().from(orderActivities).where(eq(orderActivities.orderId, pay.orderId));
    expect(acts.some((a) => a.type === "payment_failed" && a.note?.includes("amount mismatch"))).toBe(true);
  });

  it("refuses the wrong currency", async () => {
    const pay = await makeStripePayment({ amount: "1.00", piId: "pi_3" });
    status.mockResolvedValue({ piId: "pi_3", status: "succeeded", amountReceivedCents: 100, currency: "usd", paymentRef: pay.publicId, created: 1 });
    expect(await svc.settleStripePayment({ paymentRef: pay.publicId }, "webhook")).toBe("amount_mismatch");
  });

  it("does nothing while processing, but stamps provider_checked_at", async () => {
    const pay = await makeStripePayment({ amount: "1.00", piId: "pi_4" });
    status.mockResolvedValue({ piId: "pi_4", status: "processing", amountReceivedCents: 0, currency: "cad", paymentRef: pay.publicId, created: 1 });
    expect(await svc.settleStripePayment({ paymentRef: pay.publicId }, "view")).toBe("not_succeeded");
    const [row] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(row!.providerCheckedAt).toBeGreaterThan(0);
  });

  it("finds by PI id when paymentRef is absent", async () => {
    const pay = await makeStripePayment({ amount: "1.00", piId: "pi_5" });
    expect((await svc.findStripePayment({ piId: "pi_5" }))?.id).toBe(pay.id);
  });

  it("settles concurrently from webhook and return page exactly once", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: "pi_6" });
    status.mockResolvedValue({ piId: "pi_6", status: "succeeded", amountReceivedCents: 1000, currency: "cad", paymentRef: pay.publicId, created: 1 });
    await Promise.all([svc.settleStripePayment({ paymentRef: pay.publicId }, "webhook", "evt_a"), svc.settleStripePayment({ paymentRef: pay.publicId }, "return")]);
    expect(await db.select().from(ledgerEntries).where(eq(ledgerEntries.paymentId, pay.id))).toHaveLength(1);
  });
});

describe("recordStripeRefund", () => {
  beforeEach(reset);

  it("writes delta debits for cumulative partial refunds, then full refund flips status", async () => {
    const pay = await makeStripePayment({ amount: "100.00", piId: "pi_r", paid: true });
    await svc.recordStripeRefund({ piId: "pi_r", eventId: "evt_r1", amountRefundedCents: 3000, fullyRefunded: false });
    await svc.recordStripeRefund({ piId: "pi_r", eventId: "evt_r1", amountRefundedCents: 3000, fullyRefunded: false });
    await svc.recordStripeRefund({ piId: "pi_r", eventId: "evt_r2", amountRefundedCents: 10000, fullyRefunded: true });
    const debits = (await db.select().from(ledgerEntries).where(eq(ledgerEntries.paymentId, pay.id))).filter((r) => r.type === "refund");
    expect(debits.map((d) => Number(d.amount))).toEqual([30, 70]);
    const [row] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(row!.status).toBe("refunded");
  });

  it("handles a refund event that arrives before the paid event (out of order)", async () => {
    await makeStripePayment({ amount: "50.00", piId: "pi_o" });
    await expect(svc.recordStripeRefund({ piId: "pi_o", eventId: "evt_o", amountRefundedCents: 5000, fullyRefunded: true })).rejects.toThrow(/not settled/);
  });
});

describe("recordStripeDispute / recordStripeFailure", () => {
  beforeEach(reset);

  it("writes activity rows", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: "pi_d" });
    await svc.recordStripeFailure({ piId: "pi_d", paymentRef: null, reason: "card declined" });
    await svc.recordStripeDispute({ piId: "pi_d", disputeId: "dp_1", amountCents: 1000, reason: "fraudulent" });
    const types = (await db.select().from(orderActivities).where(eq(orderActivities.orderId, pay.orderId))).map((a) => a.type);
    expect(types).toEqual(expect.arrayContaining(["payment_failed", "payment_disputed"]));
  });
});
