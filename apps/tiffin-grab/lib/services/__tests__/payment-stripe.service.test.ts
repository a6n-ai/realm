import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const status = vi.fn();
const preview = vi.fn();
const create = vi.fn();
const charge = vi.fn();
const card = vi.fn();
const stripeTax = vi.fn();
const cancel = vi.fn();
const flags = { taxable: false };
vi.mock("@/lib/payments/stripe", async (orig) => ({
  ...(await orig<object>()),
  stripeRuntime: async () => ({
    stripe: { paymentIntents: { cancel: (...a: unknown[]) => cancel(...a) } },
    cfg: {
      surcharge: { enabled: true, ratePct: 2.4, excludeProvinces: ["QC"], networksNotifiedOn: "2026-09-01" },
      tax: { enabled: true, taxCode: "txcd_x", surchargeTaxable: flags.taxable },
    },
  }),
  customerStore: { get: async () => "cus_test", set: async () => {} },
}));
vi.mock("@foundry/payments/stripe", async (orig) => ({
  ...(await orig<object>()),
  fetchIntentStatus: (...a: unknown[]) => status(...a),
  previewConfirmationToken: (...a: unknown[]) => preview(...a),
  createAndConfirmIntent: (...a: unknown[]) => create(...a),
  chargeSavedCard: (...a: unknown[]) => charge(...a),
  defaultCard: (...a: unknown[]) => card(...a),
  ensureCustomer: async () => "cus_test",
}));
vi.mock("@/lib/tax/checkout-taxes", async (orig) => ({ ...(await orig<object>()), stripeTaxFor: (...a: unknown[]) => stripeTax(...a) }));

const { db } = await import("@/db/client");
const { ledgerEntries, orderActivities, orders, payments } = await import("@/db/schema");
const svc = await import("../payment-stripe");
const { claimPayment } = await import("../orders.service");
const fx = await import("./stripe-fixture");
const { makeStripePayment, reset, cleanup } = fx;

describe("settleStripePayment", () => {
  afterAll(cleanup);
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

describe("settleStripePayment guards", () => {
  beforeEach(async () => { await reset(); status.mockReset(); });
  afterAll(cleanup);

  it("never settles a succeeded PI bound to a different payment", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: "pi_x" });
    status.mockResolvedValue({ piId: "pi_x", status: "succeeded", amountReceivedCents: 1000, currency: "cad", paymentRef: "pay_other", created: 1 });
    expect(await svc.settleStripePayment({ paymentRef: pay.publicId }, "webhook")).toBe("amount_mismatch");
    expect(await svc.settleStripePayment({ paymentRef: pay.publicId }, "webhook")).toBe("amount_mismatch");
    expect(await db.select().from(ledgerEntries).where(eq(ledgerEntries.paymentId, pay.id))).toHaveLength(0);
    const acts = await db.select().from(orderActivities).where(eq(orderActivities.orderId, pay.orderId));
    expect(acts.filter((a) => a.type === "payment_failed")).toHaveLength(1);
  });

  it("a refunded payment replayed with a succeeded PI returns already_paid without a new ledger row", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: "pi_rr", paid: true });
    await db.update(payments).set({ status: "refunded" }).where(eq(payments.id, pay.id));
    status.mockResolvedValue({ piId: "pi_rr", status: "succeeded", amountReceivedCents: 1000, currency: "cad", paymentRef: pay.publicId, created: 1 });
    expect(await svc.settleStripePayment({ paymentRef: pay.publicId }, "webhook", "evt_z")).toBe("already_paid");
    expect(await db.select().from(ledgerEntries).where(eq(ledgerEntries.paymentId, pay.id))).toHaveLength(0);
  });

  it("settles a rejected stripe payment when a matching PI succeeded", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: "pi_rej" });
    await db.update(payments).set({ status: "rejected" }).where(eq(payments.id, pay.id));
    status.mockResolvedValue({ piId: "pi_rej", status: "succeeded", amountReceivedCents: 1000, currency: "cad", paymentRef: pay.publicId, created: 1 });
    expect(await svc.settleStripePayment({ paymentRef: pay.publicId }, "webhook", "evt_rej")).toBe("paid");
    expect(await db.select().from(ledgerEntries).where(eq(ledgerEntries.paymentId, pay.id))).toHaveLength(1);
  });

  it("claimPayment refuses a stripe payment", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: "pi_cl" });
    await expect(claimPayment(pay.publicId, { reference: "x" })).rejects.toThrow("settled automatically");
  });

  it("an earlier mismatch does not suppress the cancelled-order note", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: "pi_mm" });
    status.mockResolvedValue({ piId: "pi_mm", status: "succeeded", amountReceivedCents: 5, currency: "cad", paymentRef: pay.publicId, created: 1 });
    expect(await svc.settleStripePayment({ paymentRef: pay.publicId }, "webhook")).toBe("amount_mismatch");
    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, pay.orderId));
    expect(await svc.settleStripePayment({ paymentRef: pay.publicId }, "webhook")).toBe("order_cancelled");
    const acts = await db.select().from(orderActivities).where(eq(orderActivities.orderId, pay.orderId));
    expect(acts.filter((a) => a.type === "payment_failed")).toHaveLength(2);
  });

  it("does not settle on a cancelled order", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: "pi_cc" });
    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, pay.orderId));
    status.mockResolvedValue({ piId: "pi_cc", status: "succeeded", amountReceivedCents: 1000, currency: "cad", paymentRef: pay.publicId, created: 1 });
    expect(await svc.settleStripePayment({ paymentRef: pay.publicId }, "webhook")).toBe("order_cancelled");
    expect(await svc.settleStripePayment({ paymentRef: pay.publicId }, "webhook")).toBe("order_cancelled");
    expect(await db.select().from(ledgerEntries).where(eq(ledgerEntries.paymentId, pay.id))).toHaveLength(0);
    const acts = await db.select().from(orderActivities).where(eq(orderActivities.orderId, pay.orderId));
    expect(acts.filter((a) => a.type === "payment_failed")).toHaveLength(1);
  });
});

describe("recordStripeRefund", () => {
  beforeEach(reset);
  afterAll(cleanup);

  it("writes delta debits for cumulative partial refunds, then full refund flips status", async () => {
    const pay = await makeStripePayment({ amount: "100.00", piId: "pi_r", paid: true });
    await svc.recordStripeRefund({ piId: "pi_r", eventId: "evt_r1", amountRefundedCents: 3000, fullyRefunded: false });
    await svc.recordStripeRefund({ piId: "pi_r", eventId: "evt_r1", amountRefundedCents: 3000, fullyRefunded: false });
    expect((await db.select().from(payments).where(eq(payments.id, pay.id)))[0]!.status).toBe("paid");
    await svc.recordStripeRefund({ piId: "pi_r", eventId: "evt_r2", amountRefundedCents: 10000, fullyRefunded: true });
    const debits = (await db.select().from(ledgerEntries).where(eq(ledgerEntries.paymentId, pay.id))).filter((r) => r.type === "refund");
    expect(debits.map((d) => Number(d.amount))).toEqual([30, 70]);
    const [row] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(row!.status).toBe("refunded");
    const acts = await db.select().from(orderActivities).where(eq(orderActivities.orderId, pay.orderId));
    expect(acts.filter((a) => a.type === "payment_refunded").length).toBeGreaterThanOrEqual(2);
  });

  it("cancelled order with unsettled payment: records activity, no throw, no debit", async () => {
    const pay = await makeStripePayment({ amount: "50.00", piId: "pi_c" });
    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, pay.orderId));
    await svc.recordStripeRefund({ piId: "pi_c", eventId: "evt_c", amountRefundedCents: 5000, fullyRefunded: true });
    await svc.recordStripeRefund({ piId: "pi_c", eventId: "evt_c", amountRefundedCents: 5000, fullyRefunded: true });
    expect(await db.select().from(ledgerEntries).where(eq(ledgerEntries.paymentId, pay.id))).toHaveLength(0);
    const acts = await db.select().from(orderActivities).where(eq(orderActivities.orderId, pay.orderId));
    expect(acts.filter((a) => a.type === "payment_refunded" && a.note?.includes("never settled"))).toHaveLength(1);
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

describe("payByCard", () => {
  beforeEach(async () => { await reset(); vi.resetAllMocks(); flags.taxable = false; status.mockResolvedValue(undefined); });
  afterAll(cleanup);
  const go = (pay: { publicId: string }, o: { accept?: boolean; user?: string; ct?: string } = {}) =>
    svc.payByCard({ paymentPublicId: pay.publicId, userPublicId: o.user ?? fx.OWNER, confirmationTokenId: o.ct ?? "ct_1", acceptSurcharge: o.accept ?? false, returnUrl: "u" });

  it("asks to confirm a credit surcharge before charging", async () => {
    const pay = await makeStripePayment({ amount: "200.00", piId: null, postalCode: "M5H 2N2" });
    preview.mockResolvedValue({ funding: "credit", brand: "visa", last4: "4242" });
    expect(await go(pay)).toEqual({ kind: "confirm_surcharge", surcharge: "4.80", newTotal: "204.80", brand: "visa", last4: "4242" });
    expect(create).not.toHaveBeenCalled();
  });

  it("charges amount + surcharge once accepted and records card + surcharge", async () => {
    const pay = await makeStripePayment({ amount: "200.00", piId: null, postalCode: "M5H 2N2" });
    preview.mockResolvedValue({ funding: "credit", brand: "visa", last4: "4242" });
    create.mockResolvedValue({ status: "succeeded", piId: "pi_new", clientSecret: "cs" });
    status.mockResolvedValue({ piId: "pi_new", status: "succeeded", amountReceivedCents: 20480, currency: "cad", paymentRef: pay.publicId, created: 1 });
    expect(await go(pay, { accept: true })).toEqual({ kind: "succeeded" });
    expect(create.mock.calls[0]![1]).toMatchObject({ amountCents: 20480, paymentRef: pay.publicId });
    const [row] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(row).toMatchObject({ surchargeAmount: "4.80", providerRef: "pi_new", cardBrand: "visa", cardLast4: "4242" });
  });

  it("no surcharge for a Quebec postal code even with a credit card", async () => {
    const pay = await makeStripePayment({ amount: "200.00", piId: null, postalCode: "H2X 1Y4" });
    preview.mockResolvedValue({ funding: "credit", brand: "visa", last4: "4242" });
    create.mockResolvedValue({ status: "requires_action", piId: "pi_q", clientSecret: "cs" });
    await go(pay);
    expect(create.mock.calls[0]![1]).toMatchObject({ amountCents: 20000 });
  });

  it("refuses a second attempt while the previous PI is processing (double-submit)", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: "pi_prev", postalCode: "M5H 2N2" });
    status.mockResolvedValue({ piId: "pi_prev", status: "processing", amountReceivedCents: 0, currency: "cad", paymentRef: pay.publicId, created: 1 });
    expect(await go(pay, { ct: "ct_2", accept: true })).toEqual({ kind: "processing" });
    expect(create).not.toHaveBeenCalled();
  });

  it("two concurrent submits create only one PI", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: null, postalCode: "M5H 2N2" });
    preview.mockResolvedValue({ funding: "debit", brand: "visa", last4: "1111" });
    create.mockImplementation(async () => { await new Promise((r) => setTimeout(r, 150)); return { status: "requires_action", piId: "pi_one", clientSecret: "cs" }; });
    const rs = await Promise.all([go(pay, { ct: "ct_a" }), go(pay, { ct: "ct_b" })]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(rs.map((r) => r.kind).sort()).toEqual(["processing", "requires_action"]);
  });

  it("treats a Stripe idempotency 'processing' as pending: no failure recorded", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: null, postalCode: "M5H 2N2" });
    preview.mockResolvedValue({ funding: "debit", brand: "visa", last4: "1111" });
    create.mockResolvedValue({ status: "processing", piId: null, clientSecret: null, reason: "in progress" });
    expect(await go(pay)).toEqual({ kind: "processing" });
    const [row] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(row!.providerRef).toBeNull();
  });

  it("rejects a payment owned by someone else", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: null, postalCode: "M5H 2N2" });
    await expect(go(pay, { user: "usr_someone_else" })).rejects.toThrow(/not found/i);
  });

  it("refuses a cancelled order", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: null, postalCode: "M5H 2N2" });
    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, pay.orderId));
    await expect(go(pay)).rejects.toThrow("This order was cancelled");
  });

  it("recalculates an expired Stripe tax calculation before charging", async () => {
    const pay = await makeStripePayment({ amount: "113.00", piId: null, postalCode: "M5H 2N2", taxCalc: { id: "taxcalc_old", expiresAt: Date.now() - 1000 } });
    stripeTax.mockResolvedValue({ calculationId: "taxcalc_new", taxCents: 1300, totalCents: 11300, expiresAt: Date.now() + 3600_000, lines: [], reasons: [] });
    preview.mockResolvedValue({ funding: "debit", brand: "visa", last4: "1111" });
    create.mockResolvedValue({ status: "requires_action", piId: "pi_t", clientSecret: "cs" });
    await go(pay);
    expect(stripeTax.mock.calls[0]![0]).toMatchObject({ taxableCents: 10000 });
    expect(create.mock.calls[0]![1]).toMatchObject({ taxCalculationId: "taxcalc_new" });
  });

  it("refuses to charge when repriced tax differs from what the customer saw", async () => {
    const pay = await makeStripePayment({ amount: "113.00", piId: null, postalCode: "M5H 2N2", taxCalc: { id: "taxcalc_old", expiresAt: Date.now() - 1000 } });
    stripeTax.mockResolvedValue({ calculationId: "taxcalc_new", taxCents: 1500, totalCents: 11500, expiresAt: Date.now() + 3600_000, lines: [], reasons: [] });
    preview.mockResolvedValue({ funding: "debit", brand: "visa", last4: "1111" });
    await expect(go(pay)).rejects.toThrow(/tax has changed/i);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("chargeSavedCardForPayment", () => {
  beforeEach(async () => { await reset(); vi.resetAllMocks(); status.mockResolvedValue(undefined); });
  afterAll(cleanup);

  it("keys the charge by attempt and bumps it only on a definitive decline", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: null, postalCode: "M5H 2N2" });
    card.mockResolvedValue({ paymentMethodId: "pm_1", funding: "debit", brand: "visa", last4: "1111" });
    charge.mockResolvedValueOnce({ status: "processing", piId: null, clientSecret: null, reason: "in progress" });
    expect((await svc.chargeSavedCardForPayment(pay.publicId, fx.OWNER)).kind).toBe("processing");
    expect(charge.mock.calls[0]![1]).toMatchObject({ attempt: "0" });
    let [row] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(row!.chargeAttempt).toBe(0);

    charge.mockResolvedValueOnce({ status: "failed", piId: "pi_f", clientSecret: null, reason: "declined" });
    status.mockResolvedValue({ piId: "pi_f", status: "requires_payment_method", amountReceivedCents: 0, currency: "cad", paymentRef: pay.publicId, created: 1 });
    expect((await svc.chargeSavedCardForPayment(pay.publicId, fx.OWNER)).kind).toBe("failed");
    [row] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(row!.chargeAttempt).toBe(1);

    charge.mockResolvedValueOnce({ status: "requires_action", piId: "pi_r", clientSecret: "cs" });
    await svc.chargeSavedCardForPayment(pay.publicId, fx.OWNER);
    // the declined PI (requires_payment_method) is cancelled first, which also moves the key on
    expect(cancel).toHaveBeenCalledWith("pi_f");
    expect(charge.mock.calls[2]![1]).toMatchObject({ attempt: "2" });
    [row] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(row!.chargeAttempt).toBe(2);
  });

  it("reports no_card without charging", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: null, postalCode: "M5H 2N2" });
    card.mockResolvedValue(null);
    expect((await svc.chargeSavedCardForPayment(pay.publicId, fx.OWNER)).kind).toBe("no_card");
    expect(charge).not.toHaveBeenCalled();
  });
});

describe("payByCard prior-PI and surcharge-tax guards", () => {
  beforeEach(async () => { await reset(); vi.resetAllMocks(); flags.taxable = false; status.mockResolvedValue(undefined); });
  afterAll(cleanup);
  const go = (pay: { publicId: string }, accept = false) =>
    svc.payByCard({ paymentPublicId: pay.publicId, userPublicId: fx.OWNER, confirmationTokenId: "ct_n", acceptSurcharge: accept, returnUrl: "u" });
  const st = (pay: { publicId: string }, piId: string, status: string, amt = 0) =>
    ({ piId, status, amountReceivedCents: amt, currency: "cad", paymentRef: pay.publicId, created: 1 });

  it("cancels a prior requires_action PI before creating a new one", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: "pi_old", postalCode: "M5H 2N2" });
    status.mockResolvedValue(st(pay, "pi_old", "requires_action"));
    preview.mockResolvedValue({ funding: "debit", brand: "visa", last4: "1111" });
    cancel.mockImplementation(async () => { expect(create).not.toHaveBeenCalled(); });
    create.mockResolvedValue({ status: "requires_action", piId: "pi_new", clientSecret: "cs" });
    expect((await go(pay)).kind).toBe("requires_action");
    expect(cancel).toHaveBeenCalledWith("pi_old");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("settles instead of charging again when cancel fails because the PI succeeded", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: "pi_old", postalCode: "M5H 2N2" });
    status.mockResolvedValueOnce(st(pay, "pi_old", "requires_action"))
      .mockResolvedValue(st(pay, "pi_old", "succeeded", 1000));
    cancel.mockRejectedValue(new Error("already succeeded"));
    expect(await go(pay)).toEqual({ kind: "succeeded" });
    expect(create).not.toHaveBeenCalled();
    const [row] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(row!.status).toBe("paid");
  });

  it("does not claim success when a succeeded PI cannot be settled", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: "pi_old", postalCode: "M5H 2N2" });
    status.mockResolvedValue(st(pay, "pi_old", "succeeded", 5));
    expect(await go(pay)).toEqual({ kind: "processing" });
  });

  it("includes tax on a taxable surcharge in the confirm total, the charge and surcharge_amount", async () => {
    flags.taxable = true;
    const pay = await makeStripePayment({ amount: "113.00", piId: null, postalCode: "M5H 2N2", taxCalc: { id: "c0", expiresAt: Date.now() + 3600_000 } });
    preview.mockResolvedValue({ funding: "credit", brand: "visa", last4: "4242" });
    const q = (id: string, tax: number) => ({ calculationId: id, taxCents: tax, totalCents: 0, expiresAt: Date.now() + 3600_000, lines: [], reasons: [] });
    stripeTax.mockResolvedValueOnce(q("c_base", 1300)).mockResolvedValueOnce(q("c_fee", 1335));
    expect(await go(pay)).toMatchObject({ kind: "confirm_surcharge", surcharge: "3.06", newTotal: "116.06" });
    expect(create).not.toHaveBeenCalled();

    stripeTax.mockResolvedValueOnce(q("c_base", 1300)).mockResolvedValueOnce(q("c_fee", 1335));
    create.mockResolvedValue({ status: "requires_action", piId: "pi_t", clientSecret: "cs" });
    await go(pay, true);
    expect(create.mock.calls[0]![1]).toMatchObject({ amountCents: 11606, taxCalculationId: "c_fee" });
    const [row] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(row).toMatchObject({ surchargeAmount: "3.06", taxCalculationId: "c0" });
  });

  it("resets surcharge and card on a decline", async () => {
    const pay = await makeStripePayment({ amount: "200.00", piId: null, postalCode: "M5H 2N2" });
    preview.mockResolvedValue({ funding: "credit", brand: "visa", last4: "4242" });
    create.mockResolvedValue({ status: "failed", piId: "pi_d", clientSecret: null, reason: "declined" });
    expect((await go(pay, true)).kind).toBe("failed");
    const [row] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(row).toMatchObject({ surchargeAmount: "0.00", cardBrand: null, cardLast4: null });
  });

  it("persists a replacement tax calculation onto the order snapshot", async () => {
    const pay = await makeStripePayment({ amount: "113.00", piId: null, postalCode: "M5H 2N2", taxCalc: { id: "taxcalc_old", expiresAt: Date.now() - 1000 } });
    const exp = Date.now() + 3600_000;
    stripeTax.mockResolvedValue({ calculationId: "taxcalc_new", taxCents: 1300, totalCents: 11300, expiresAt: exp, lines: [], reasons: [] });
    preview.mockResolvedValue({ funding: "debit", brand: "visa", last4: "1111" });
    create.mockResolvedValue({ status: "requires_action", piId: "pi_p", clientSecret: "cs" });
    await go(pay);
    const [o] = await db.select().from(orders).where(eq(orders.id, pay.orderId));
    expect((o!.pricingSnapshot as { tax: unknown }).tax).toEqual({ source: "stripe", calculationId: "taxcalc_new", expiresAt: exp });
  });
});
