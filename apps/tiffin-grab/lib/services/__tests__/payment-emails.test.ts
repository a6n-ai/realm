/**
 * Customer payment emails per method (outbox payloads).
 * Run: env -u DATABASE_URL ... pnpm exec vitest run lib/services/__tests__/payment-emails.test.ts --no-file-parallelism
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { notificationOutbox, orders, payments } = await import("@/db/schema");
const { createOrder, claimPayment, verifyPayment, receiptVars } = await import("../orders.service");
const { setPaymentConfig } = await import("../app-settings.service");
const { sharedCache } = await import("@/lib/cache");
const { baseInput, reset, cleanup, makeStripePayment } = await import("./stripe-fixture");

afterAll(cleanup);

const card = { cardBrand: "visa", cardLast4: "4242" };

describe("receiptVars", () => {
  it("card: brand, fee and total charged", () => {
    const v = receiptVars({ method: "stripe", amount: "50.00", surchargeAmount: "1.50", ...card }, []);
    expect(v).toMatchObject({ paidWith: "Visa •••• 4242", cardFee: "$1.50", totalCharged: "$51.50" });
    expect(v.receiptLines).toContain("Card fee $1.50");
  });
  it("card without a fee has no cardFee", () => {
    const v = receiptVars({ method: "stripe", amount: "50.00", surchargeAmount: "0", ...card }, []);
    expect(v).toMatchObject({ cardFee: "", totalCharged: "$50.00" });
    expect(v.receiptLines).not.toContain("Card fee");
  });
  it.each([["etransfer", "Interac e-Transfer"], ["cash", "Cash"]] as const)("%s has no card values", (method, label) => {
    const v = receiptVars({ method, amount: "50.00", surchargeAmount: "0", cardBrand: null, cardLast4: null }, []);
    expect(v).toMatchObject({ paidWith: label, cardFee: "", totalCharged: "", receiptLines: "" });
  });
});

async function outbox(userId: bigint, event: "payment_approved" | "payment_received" | "order_created") {
  const rows = await db
    .select({ payload: notificationOutbox.payload })
    .from(notificationOutbox)
    .where(and(eq(notificationOutbox.recipientId, userId), eq(notificationOutbox.event, event), eq(notificationOutbox.channel, "email")));
  return rows.map((r) => r.payload as { body: string; vars: { payment?: Record<string, string>; order?: Record<string, string> } });
}

async function orderOf(paymentPublicId: string) {
  const [row] = await db.select({ userId: orders.userId, orderId: payments.orderId }).from(payments).innerJoin(orders, eq(orders.id, payments.orderId)).where(eq(payments.publicId, paymentPublicId));
  return row!;
}

describe("payment emails by method", () => {
  beforeEach(reset);

  it("stripe card: approved email names the card, fee and total", async () => {
    const pay = await makeStripePayment({ amount: "50.00", surcharge: "1.50", piId: "pi_x" });
    await db.update(payments).set(card).where(eq(payments.id, pay.id));
    await verifyPayment(pay.publicId, { actorId: null, fromProvider: true });
    const { userId } = await orderOf(pay.publicId);
    const [mail] = await outbox(userId!, "payment_approved");
    expect(mail!.vars.payment).toMatchObject({ paidWith: "Visa •••• 4242", cardFee: "$1.50", totalCharged: "$51.50" });
    expect(mail!.body).toContain("$51.50");
  });

  it("stripe card without a fee: no cardFee", async () => {
    const pay = await makeStripePayment({ amount: "50.00", piId: "pi_y" });
    await db.update(payments).set(card).where(eq(payments.id, pay.id));
    await verifyPayment(pay.publicId, { actorId: null, fromProvider: true });
    const [mail] = await outbox((await orderOf(pay.publicId)).userId!, "payment_approved");
    expect(mail!.vars.payment).toMatchObject({ paidWith: "Visa •••• 4242", cardFee: "", totalCharged: "$50.00" });
  });

  it("e-Transfer: claim sends payment_received, approval shows e-Transfer with no card values", async () => {
    const { paymentPublicId } = await createOrder(await baseInput({ paymentMethodId: "etransfer", phone: "+16475557001" }));
    await claimPayment(paymentPublicId, { reference: "REF-1" });
    await verifyPayment(paymentPublicId);
    const { userId } = await orderOf(paymentPublicId);
    expect(await outbox(userId!, "payment_received")).toHaveLength(1);
    const [mail] = await outbox(userId!, "payment_approved");
    expect(mail!.vars.payment).toMatchObject({ paidWith: "Interac e-Transfer", cardFee: "", totalCharged: "" });
  });

  it("cash: order confirmation says due on delivery; staff approval says Cash", async () => {
    await setPaymentConfig({ methods: [{ id: "cash", kind: "manual", enabled: true, label: "Cash", taxes: [] }] });
    await sharedCache("app-settings").evictAll();
    const { paymentPublicId } = await createOrder(await baseInput({ paymentMethodId: "cash", phone: "+16475557002" }));
    const { userId } = await orderOf(paymentPublicId);
    const [created] = await outbox(userId!, "order_created");
    expect(created!.vars.order!.paymentNote).toMatch(/due in cash on delivery/);
    expect(created!.body).not.toMatch(/paid|confirmed/i);
    expect(await outbox(userId!, "payment_approved")).toHaveLength(0);

    await verifyPayment(paymentPublicId);
    const [mail] = await outbox(userId!, "payment_approved");
    expect(mail!.vars.payment).toMatchObject({ paidWith: "Cash", cardFee: "", totalCharged: "" });
  });

  it("non-cash orders get no order_created email", async () => {
    const { paymentPublicId } = await createOrder(await baseInput({ paymentMethodId: "etransfer", phone: "+16475557003" }));
    expect(await outbox((await orderOf(paymentPublicId)).userId!, "order_created")).toHaveLength(0);
  });
});
