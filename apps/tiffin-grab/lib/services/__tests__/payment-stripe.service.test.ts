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
const list = vi.fn();
const refund = vi.fn();
const retrieve = vi.fn();
const flags = { taxable: false, noCustomer: false, tokenCustomer: null as string | null };
const cards = vi.fn();
vi.mock("@/lib/payments/stripe", async (orig) => ({
  ...(await orig<object>()),
  stripeRuntime: async () => ({
    stripe: { confirmationTokens: { retrieve: async () => ({ payment_method_preview: { customer: flags.tokenCustomer } }) }, paymentIntents: { cancel: (...a: unknown[]) => cancel(...a), retrieve: (...a: unknown[]) => retrieve(...a) } },
    cfg: {
      surcharge: { enabled: true, ratePct: 2.4, excludeProvinces: ["QC"], networksNotifiedOn: "2026-09-01" },
      tax: { enabled: true, taxCode: "txcd_x", surchargeTaxable: flags.taxable },
    },
  }),
  customerStore: { get: async () => (flags.noCustomer ? null : "cus_test"), set: async () => {} },
}));
vi.mock("@foundry/payments/stripe", async (orig) => ({
  ...(await orig<object>()),
  fetchIntentStatus: (...a: unknown[]) => status(...a),
  previewConfirmationToken: (...a: unknown[]) => preview(...a),
  createAndConfirmIntent: (...a: unknown[]) => create(...a),
  chargeSavedCard: (...a: unknown[]) => charge(...a),
  defaultCard: (...a: unknown[]) => card(...a),
  ensureCustomer: async () => "cus_test",
  listIntents: (...a: unknown[]) => list(...a),
  listCards: (...a: unknown[]) => cards(...a),
  refundIntent: (...a: unknown[]) => refund(...a),
}));
vi.mock("@/lib/tax/checkout-taxes", async (orig) => ({ ...(await orig<object>()), stripeTaxFor: (...a: unknown[]) => stripeTax(...a) }));

const staffNotify = vi.fn();
vi.mock("@/lib/notifications/enqueue", async (orig) => {
  const real = await orig<typeof import("@/lib/notifications/enqueue")>();
  staffNotify.mockImplementation(real.enqueueStaffNotification);
  return { ...real, enqueueStaffNotification: (...a: Parameters<typeof real.enqueueStaffNotification>) => staffNotify(...a) };
});

const { db } = await import("@/db/client");
const { ledgerEntries, orderActivities, orders, payments } = await import("@/db/schema");
const svc = await import("../payment-stripe");
const { claimPayment } = await import("../orders.service");
const fx = await import("./stripe-fixture");
const { makeStripePayment, reset, cleanup } = fx;
// The fixture's reset() enables e-Transfer in the shared test DB; restore an empty
// payment config after the whole file so later suites (which order in simulated mode) still work.
afterAll(cleanup);

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

  it("flags a second succeeded PI on an already-paid payment as a duplicate charge", async () => {
    const pay = await makeStripePayment({ amount: "200.00", piId: "pi_first" });
    status.mockResolvedValue({ piId: "pi_first", status: "succeeded", amountReceivedCents: 20000, currency: "cad", paymentRef: pay.publicId, created: 1 });
    expect(await svc.settleStripePayment({ paymentRef: pay.publicId }, "webhook", "evt_a")).toBe("paid");
    status.mockResolvedValue({ piId: "pi_second", status: "succeeded", amountReceivedCents: 20000, currency: "cad", paymentRef: pay.publicId, created: 2 });
    expect(await svc.settleStripePayment({ paymentRef: pay.publicId, piId: "pi_second" }, "webhook", "evt_b")).toBe("already_paid");
    const acts = await db.select().from(orderActivities).where(eq(orderActivities.orderId, pay.orderId));
    expect(acts.filter((a) => a.note?.startsWith("Duplicate card charge pi_second"))).toHaveLength(1);
  });

  it("a retry's PI never replaces the PI that already settled the payment", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: null, postalCode: "M5H 2N2" });
    preview.mockResolvedValue({ type: "card", funding: "debit", brand: "visa", last4: "1111", wallet: null });
    // PI A's late webhook settles the payment while PI B's create is in flight.
    create.mockImplementation(async () => {
      status.mockResolvedValue({ piId: "pi_a", status: "succeeded", amountReceivedCents: 1000, currency: "cad", paymentRef: pay.publicId, created: 1 });
      await svc.settleStripePayment({ paymentRef: pay.publicId, piId: "pi_a" }, "webhook", "evt_a");
      return { status: "succeeded", piId: "pi_b", clientSecret: "cs" };
    });
    await svc.payByCard({ paymentPublicId: pay.publicId, userPublicId: fx.OWNER, source: { confirmationTokenId: "ct_b" }, acceptSurcharge: false, returnUrl: "u" });
    const [row] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(row).toMatchObject({ status: "paid", providerRef: "pi_a" });
  });

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
    expect(staffNotify).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ dedupeKey: expect.stringMatching(/^paid_not_started:/) }));
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

  it("full refund of a surcharged payment leaves exactly one ledger refund row of amount + surcharge", async () => {
    const pay = await makeStripePayment({ amount: "100.00", surcharge: "2.40", piId: "pi_s", paid: true });
    await svc.recordStripeRefund({ piId: "pi_s", eventId: "evt_s", amountRefundedCents: 10240, fullyRefunded: true });
    const rows = (await db.select().from(ledgerEntries).where(eq(ledgerEntries.paymentId, pay.id))).filter((r) => r.type === "refund");
    expect(rows.map((r) => Number(r.amount))).toEqual([102.4]);
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
  beforeEach(async () => { await reset(); vi.resetAllMocks(); flags.taxable = false; flags.tokenCustomer = null; status.mockResolvedValue(undefined); });
  afterAll(cleanup);
  const go = (pay: { publicId: string }, o: { accept?: boolean; user?: string; ct?: string } = {}) =>
    svc.payByCard({ paymentPublicId: pay.publicId, userPublicId: o.user ?? fx.OWNER, source: { confirmationTokenId: o.ct ?? "ct_1" }, acceptSurcharge: o.accept ?? false, returnUrl: "u" });

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
    expect(await go(pay, { accept: true })).toMatchObject({ kind: "succeeded", receipt: { feeCents: 480, totalCents: 20480 } });
    expect(create.mock.calls[0]![1]).toMatchObject({ amountCents: 20480, paymentRef: pay.publicId });
    const [row] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(row).toMatchObject({ surchargeAmount: "4.80", providerRef: "pi_new", cardBrand: "visa", cardLast4: "4242" });
  });

  it("charges a token minted from the customer's own saved card", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: null, postalCode: "M5H 2N2" });
    flags.tokenCustomer = "cus_test";
    preview.mockResolvedValue({ funding: "debit", brand: "visa", last4: "1111" });
    create.mockResolvedValue({ status: "requires_action", piId: "pi_t", clientSecret: "cs" });
    expect((await go(pay)).kind).toBe("requires_action");
    expect(create.mock.calls[0]![1]).toMatchObject({ confirmationTokenId: "ct_1" });
  });

  it("rejects a token minted from another customer's saved card before any charge", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: null, postalCode: "M5H 2N2" });
    flags.tokenCustomer = "cus_someone_else";
    preview.mockResolvedValue({ funding: "debit", brand: "visa", last4: "1111" });
    await expect(go(pay)).rejects.toThrow(/not available/);
    expect(create).not.toHaveBeenCalled();
  });

  it("recovers from a stale customer id with exactly one retry", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: null, postalCode: "M5H 2N2" });
    preview.mockResolvedValue({ funding: "debit", brand: "visa", last4: "1111" });
    const gone = Object.assign(new Error("No such customer: 'cus_test'"), { type: "StripeInvalidRequestError", code: "resource_missing", param: "customer" });
    create.mockRejectedValueOnce(gone).mockResolvedValueOnce({ status: "requires_action", piId: "pi_r", clientSecret: "cs" });
    expect((await go(pay)).kind).toBe("requires_action");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("charges Link at the base amount, labelled Link, with no surcharge prompt", async () => {
    const pay = await makeStripePayment({ amount: "200.00", piId: null, postalCode: "M5H 2N2" });
    preview.mockResolvedValue({ type: "link", funding: "unknown", brand: null, last4: null, wallet: "link" });
    create.mockResolvedValue({ status: "succeeded", piId: "pi_link", clientSecret: "cs" });
    status.mockResolvedValue({ piId: "pi_link", status: "succeeded", amountReceivedCents: 20000, currency: "cad", paymentRef: pay.publicId, created: 1 });
    expect(await go(pay)).toMatchObject({ kind: "succeeded", receipt: { paidWith: "Link", feeCents: 0, totalCents: 20000 } });
  });

  it("refuses a non-card payment method before any charge", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: null, postalCode: "M5H 2N2" });
    preview.mockResolvedValue({ type: "klarna", funding: "unknown", brand: null, last4: null, wallet: null });
    await expect(go(pay)).rejects.toThrow(/Pay with a card/);
    expect(create).not.toHaveBeenCalled();
  });

  it("a Stripe rejection of the create clears the card, records activity and alerts staff", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: null, postalCode: "M5H 2N2" });
    preview.mockResolvedValue({ type: "card", funding: "debit", brand: "visa", last4: "1111", wallet: null });
    create.mockRejectedValue(Object.assign(new Error("allowed_payment_method_types cannot be confirmed"), { type: "StripeInvalidRequestError" }));
    await expect(go(pay)).rejects.toThrow(/allowed_payment_method_types/);
    const [row] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(row).toMatchObject({ cardBrand: null, cardLast4: null, surchargeAmount: "0.00" });
    const acts = await db.select().from(orderActivities).where(eq(orderActivities.orderId, pay.orderId));
    expect(acts.some((a) => a.type === "payment_failed" && a.note?.startsWith("Card payment could not start"))).toBe(true);
    expect(staffNotify).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ dedupeKey: `intent_error:${pay.publicId}` }));
  });

  it("a timed-out create keeps the stamped card and fee so a late success still settles", async () => {
    const pay = await makeStripePayment({ amount: "200.00", piId: null, postalCode: "M5H 2N2" });
    preview.mockResolvedValue({ type: "card", funding: "credit", brand: "visa", last4: "4242", wallet: null });
    create.mockRejectedValue(Object.assign(new Error("Request timed out"), { type: "StripeConnectionError" }));
    await expect(go(pay, { accept: true })).rejects.toThrow(/timed out/);
    const [row] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(row).toMatchObject({ cardBrand: "visa", surchargeAmount: "4.80" });
  });

  it("does not retry a second missing-customer error", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: null, postalCode: "M5H 2N2" });
    preview.mockResolvedValue({ funding: "debit", brand: "visa", last4: "1111" });
    create.mockRejectedValue(Object.assign(new Error("No such customer"), { type: "StripeInvalidRequestError", code: "resource_missing", param: "customer" }));
    await expect(go(pay)).rejects.toThrow(/No such customer/);
    expect(create).toHaveBeenCalledTimes(2);
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

  it("is refused while the customer is mid-checkout (customer pay lock held)", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: null, postalCode: "M5H 2N2" });
    const { getRedis } = await import("@/lib/redis");
    const key = `pay-lock:${fx.OWNER}`;
    await getRedis().set(key, "checkout", "PX", 30_000, "NX");
    try {
      const r = await svc.chargeSavedCardForPayment(pay.publicId, fx.OWNER);
      expect(r).toEqual({ kind: "processing", message: "The customer is paying right now." });
      expect(charge).not.toHaveBeenCalled();
    } finally {
      await getRedis().del(key);
    }
  });

  it("treats a stale customer id as no_card", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: null, postalCode: "M5H 2N2" });
    card.mockRejectedValue(Object.assign(new Error("No such customer: 'cus_test'"), { type: "StripeInvalidRequestError", code: "resource_missing", param: "customer" }));
    expect((await svc.chargeSavedCardForPayment(pay.publicId, fx.OWNER)).kind).toBe("no_card");
    expect(charge).not.toHaveBeenCalled();
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
    svc.payByCard({ paymentPublicId: pay.publicId, userPublicId: fx.OWNER, source: { confirmationTokenId: "ct_n" }, acceptSurcharge: accept, returnUrl: "u" });
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
    expect(await go(pay)).toMatchObject({ kind: "succeeded", receipt: { feeCents: 0, totalCents: 1000 } });
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

describe("abandonCardAttempt and acceptSurcharge", () => {
  beforeEach(async () => { await reset(); vi.resetAllMocks(); flags.taxable = false; status.mockResolvedValue(undefined); });
  afterAll(cleanup);
  const st = (pay: { publicId: string }, piId: string, s: string) =>
    ({ piId, status: s, amountReceivedCents: 0, currency: "cad", paymentRef: pay.publicId, created: 1 });

  it("clears card and fee when the PI is dead, never touching amount", async () => {
    const pay = await makeStripePayment({ amount: "200.00", surcharge: "4.80", piId: "pi_x" });
    status.mockResolvedValue(st(pay, "pi_x", "requires_payment_method"));
    await svc.abandonCardAttempt(pay.publicId, fx.OWNER);
    const [row] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(row).toMatchObject({ surchargeAmount: "0.00", cardBrand: null, cardLast4: null, amount: "200.00" });
  });

  it.each(["succeeded", "processing"])("is a no-op when the PI is %s", async (s) => {
    const pay = await makeStripePayment({ amount: "200.00", surcharge: "4.80", piId: "pi_y" });
    status.mockResolvedValue(st(pay, "pi_y", s));
    await svc.abandonCardAttempt(pay.publicId, fx.OWNER);
    const [row] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(row!.surchargeAmount).toBe("4.80");
  });

  it("refuses a foreign user", async () => {
    const pay = await makeStripePayment({ amount: "200.00", surcharge: "4.80", piId: "pi_z" });
    await expect(svc.abandonCardAttempt(pay.publicId, "usr_other")).rejects.toThrow();
    expect(status).not.toHaveBeenCalled();
  });

  it("acceptSurcharge never lowers the charge: a debit card is charged the base amount only", async () => {
    const pay = await makeStripePayment({ amount: "200.00", piId: null, postalCode: "M5H 2N2" });
    preview.mockResolvedValue({ funding: "debit", brand: "visa", last4: "1111" });
    create.mockResolvedValue({ status: "requires_action", piId: "pi_d", clientSecret: "cs" });
    await svc.payByCard({ paymentPublicId: pay.publicId, userPublicId: fx.OWNER, source: { confirmationTokenId: "ct" }, acceptSurcharge: true, returnUrl: "u" });
    expect(create.mock.calls[0]![1]).toMatchObject({ amountCents: 20000 });
  });
});

describe("surcharge bypass detection and abandon cancel", () => {
  beforeEach(async () => { await reset(); vi.resetAllMocks(); flags.taxable = false; status.mockResolvedValue(undefined); });
  afterAll(cleanup);
  const succeeded = (pay: { publicId: string }, cents: number) =>
    status.mockResolvedValue({ piId: "pi_s", status: "succeeded", amountReceivedCents: cents, currency: "cad", paymentRef: pay.publicId, created: 1 });
  const flagged = async (orderId: bigint) =>
    (await db.select().from(orderActivities).where(eq(orderActivities.orderId, orderId))).filter((a) => a.note?.startsWith("Credit card used without surcharge pi_s"));

  it("settles a credit charge with no surcharge and flags it once", async () => {
    const pay = await makeStripePayment({ amount: "200.00", piId: "pi_s", postalCode: "M5H 2N2" });
    succeeded(pay, 20000);
    retrieve.mockResolvedValue({ latest_charge: { payment_method_details: { card: { funding: "credit" } } } });
    expect(await svc.settleStripePayment({ paymentRef: pay.publicId }, "webhook")).toBe("paid");
    await svc.settleStripePayment({ paymentRef: pay.publicId }, "view");
    const [row] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(row!.status).toBe("paid");
    const acts = await flagged(pay.orderId);
    expect(acts).toHaveLength(1);
    expect(acts[0]!.note).toContain("4.80");
  });

  it("does not flag a credit card paid through a wallet", async () => {
    const pay = await makeStripePayment({ amount: "200.00", piId: "pi_s", postalCode: "M5H 2N2" });
    succeeded(pay, 20000);
    retrieve.mockResolvedValue({ latest_charge: { payment_method_details: { card: { funding: "credit", wallet: { type: "apple_pay" } } } } });
    expect(await svc.settleStripePayment({ paymentRef: pay.publicId }, "webhook")).toBe("paid");
    expect(retrieve).toHaveBeenCalled();
    expect(await flagged(pay.orderId)).toHaveLength(0);
  });

  it("does not flag a debit card", async () => {
    const pay = await makeStripePayment({ amount: "200.00", piId: "pi_s", postalCode: "M5H 2N2" });
    succeeded(pay, 20000);
    retrieve.mockResolvedValue({ latest_charge: { payment_method_details: { card: { funding: "debit" } } } });
    expect(await svc.settleStripePayment({ paymentRef: pay.publicId }, "webhook")).toBe("paid");
    expect(await flagged(pay.orderId)).toHaveLength(0);
  });

  it("still settles when the retrieve fails", async () => {
    const pay = await makeStripePayment({ amount: "200.00", piId: "pi_s", postalCode: "M5H 2N2" });
    succeeded(pay, 20000);
    retrieve.mockRejectedValue(new Error("boom"));
    expect(await svc.settleStripePayment({ paymentRef: pay.publicId }, "webhook")).toBe("paid");
  });

  it("abandonCardAttempt cancels the open PI before clearing", async () => {
    const pay = await makeStripePayment({ amount: "200.00", surcharge: "4.80", piId: "pi_o" });
    status.mockResolvedValue({ piId: "pi_o", status: "requires_payment_method", amountReceivedCents: 0, currency: "cad", paymentRef: pay.publicId, created: 1 });
    await svc.abandonCardAttempt(pay.publicId, fx.OWNER);
    expect(cancel).toHaveBeenCalledWith("pi_o");
    const [row] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(row!.surchargeAmount).toBe("0.00");
  });
});

describe("reconcileStripe", () => {
  beforeEach(async () => { await reset(); vi.clearAllMocks(); });

  it("classifies differences without writing anything", async () => {
    const unpaid = await makeStripePayment({ amount: "10.00", piId: "pi_a" });
    const differs = await makeStripePayment({ amount: "20.00", piId: "pi_b" });
    const paidMissing = await makeStripePayment({ amount: "30.00", piId: "pi_c", paid: true });
    list.mockResolvedValue({ nextCursor: null, items: [
      { piId: "pi_a", status: "succeeded", amountReceivedCents: 1000, currency: "cad", paymentRef: unpaid.publicId, created: 1 },
      { piId: "pi_b", status: "succeeded", amountReceivedCents: 1999, currency: "cad", paymentRef: differs.publicId, created: 1 },
      { piId: "pi_z", status: "succeeded", amountReceivedCents: 500, currency: "cad", paymentRef: null, created: 1 },
    ] });
    const { rows } = await svc.reconcileStripe({ from: 0, to: Date.now() + 60_000 });
    expect(rows).toHaveLength(4);
    expect(rows).toEqual(expect.arrayContaining([
      { kind: "unpaid_here", piId: "pi_a", paymentRef: unpaid.publicId, amount: "10.00", effect: expect.any(String) },
      { kind: "amount_differs", piId: "pi_b", paymentRef: differs.publicId, stripe: "19.99", ours: "20.00" },
      { kind: "unmatched_charge", piId: "pi_z", amount: "5.00" },
      { kind: "paid_here_not_in_stripe", paymentRef: paidMissing.publicId, piId: "pi_c", amount: "30.00" },
    ]));
    expect(await db.select().from(ledgerEntries)).toHaveLength(0);
  });
});

describe("refundStripePayment", () => {
  const charge = (amount: number, refunded: number) => retrieve.mockResolvedValue({ latest_charge: { amount, amount_refunded: refunded } });
  beforeEach(async () => { await reset(); vi.clearAllMocks(); refund.mockResolvedValue("re_1"); });

  it("asks Stripe with a key counted from Stripe's amount_refunded and writes no ledger row", async () => {
    const pay = await makeStripePayment({ amount: "20.00", surcharge: "0.48", piId: "pi_r", paid: true });
    charge(2048, 0);
    await svc.refundStripePayment(pay.publicId, "5.00", "goodwill", fx.OWNER);
    expect(refund).toHaveBeenCalledWith(expect.anything(), "pi_r", 500, `refund:${pay.publicId}:500:0`);
    expect(await db.select().from(ledgerEntries).where(eq(ledgerEntries.type, "refund"))).toHaveLength(0);
  });

  it("refunds Stripe's remainder when amount is null, even with no ledger row yet", async () => {
    const pay = await makeStripePayment({ amount: "20.00", surcharge: "0.48", piId: "pi_r", paid: true });
    charge(2048, 1000);
    await svc.refundStripePayment(pay.publicId, null, "dup", fx.OWNER);
    expect(refund).toHaveBeenCalledWith(expect.anything(), "pi_r", 1048, `refund:${pay.publicId}:1048:1000`);
  });

  it("caps at our own total when Stripe's charge is larger", async () => {
    const pay = await makeStripePayment({ amount: "20.00", piId: "pi_r", paid: true });
    charge(5000, 0);
    await expect(svc.refundStripePayment(pay.publicId, "20.01", "x", fx.OWNER)).rejects.toThrow(/between 0.01 and 20.00/);
    await svc.refundStripePayment(pay.publicId, null, "x", fx.OWNER);
    expect(refund).toHaveBeenCalledWith(expect.anything(), "pi_r", 2000, `refund:${pay.publicId}:2000:0`);
  });

  it("rejects over-remainder, bad amounts, unpaid payments and blank reasons before refunding", async () => {
    const pay = await makeStripePayment({ amount: "20.00", piId: "pi_r", paid: true });
    charge(2000, 500);
    await expect(svc.refundStripePayment(pay.publicId, "15.01", "x", fx.OWNER)).rejects.toThrow(/between/);
    await expect(svc.refundStripePayment(pay.publicId, "NaN", "x", fx.OWNER)).rejects.toThrow(/greater than zero/);
    await expect(svc.refundStripePayment(pay.publicId, "-1", "x", fx.OWNER)).rejects.toThrow(/greater than zero/);
    await expect(svc.refundStripePayment(pay.publicId, "1.00", " ", fx.OWNER)).rejects.toThrow(/reason/);
    const open = await makeStripePayment({ amount: "5.00", piId: "pi_u" });
    await expect(svc.refundStripePayment(open.publicId, null, "x", fx.OWNER)).rejects.toThrow(/settled/);
    expect(refund).not.toHaveBeenCalled();
  });
});

describe("reconcileStripe late and missing payments", () => {
  beforeEach(async () => { await reset(); vi.clearAllMocks(); });

  it("matches a payment created before the range to a PI inside it", async () => {
    const old = await makeStripePayment({ amount: "10.00", piId: "pi_late" });
    await db.update(payments).set({ createdAt: 1000 }).where(eq(payments.id, old.id));
    list.mockResolvedValue({ nextCursor: null, items: [{ piId: "pi_late", status: "succeeded", amountReceivedCents: 1000, currency: "cad", paymentRef: old.publicId, created: 1 }] });
    const { rows } = await svc.reconcileStripe({ from: Date.now() - 1000, to: Date.now() + 60_000 });
    expect(rows).toEqual([{ kind: "unpaid_here", piId: "pi_late", paymentRef: old.publicId, amount: "10.00", effect: expect.any(String) }]);
  });

  it("does not flag a paid row whose PI succeeded outside the listed page", async () => {
    const ok = await makeStripePayment({ amount: "10.00", piId: "pi_ok", paid: true });
    const gone = await makeStripePayment({ amount: "11.00", piId: "pi_gone", paid: true });
    list.mockResolvedValue({ nextCursor: null, items: [] });
    status.mockImplementation(async (_s: unknown, id: string) =>
      id === "pi_ok" ? { piId: id, status: "succeeded", amountReceivedCents: 1000, currency: "cad", paymentRef: ok.publicId, created: 1 } : { piId: id, status: "canceled", amountReceivedCents: 0, currency: "cad", paymentRef: gone.publicId, created: 1 });
    const { rows } = await svc.reconcileStripe({ from: 0, to: Date.now() + 60_000 });
    expect(rows).toEqual([{ kind: "paid_here_not_in_stripe", paymentRef: gone.publicId, piId: "pi_gone", amount: "11.00" }]);
  });
});

describe("reconcileStripe bounds and binding", () => {
  beforeEach(async () => { await reset(); vi.clearAllMocks(); });

  it("treats a PI whose paymentRef row is bound to another PI as unmatched", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: "pi_bound" });
    list.mockResolvedValue({ nextCursor: null, items: [{ piId: "pi_other", status: "succeeded", amountReceivedCents: 1000, currency: "cad", paymentRef: pay.publicId, created: 1 }] });
    const { rows } = await svc.reconcileStripe({ from: 0, to: Date.now() + 60_000 });
    expect(rows).toEqual([{ kind: "unmatched_charge", piId: "pi_other", amount: "10.00" }]);
  });

  it("checks at most 50 paid rows individually and says so", async () => {
    for (let i = 0; i < 51; i++) await makeStripePayment({ amount: "1.00", piId: `pi_m${i}`, paid: true });
    list.mockResolvedValue({ nextCursor: null, items: [] });
    status.mockImplementation(async (_s: unknown, id: string) => ({ piId: id, status: "canceled", amountReceivedCents: 0, currency: "cad", paymentRef: null, created: 1 }));
    const { rows, truncated } = await svc.reconcileStripe({ from: 0, to: Date.now() + 60_000 });
    expect(truncated).toBe(true);
    expect(rows).toHaveLength(50);
    expect(status).toHaveBeenCalledTimes(50);
  });
});

describe("settleStaleOnView", () => {
  beforeEach(async () => { await reset(); status.mockReset(); });
  const view = (p: { publicId: string; method: string; status: string; providerRef: string | null }, providerCheckedAt: number | null) => ({
    publicId: p.publicId, method: p.method, status: p.status, providerRef: p.providerRef, providerCheckedAt,
  });

  it("checks rows not looked at in the last two minutes and skips fresh, paid and PI-less rows", async () => {
    const stale = await makeStripePayment({ amount: "10.00", piId: "pi_stale" });
    status.mockResolvedValue({ piId: "pi_stale", status: "processing", amountReceivedCents: 0, currency: "cad", paymentRef: stale.publicId, created: 1 });

    await svc.settleStaleOnView([
      view(stale, Date.now() - 5 * 60_000),
      view({ ...stale, publicId: "pay_fresh" }, Date.now() - 30_000),
      view({ ...stale, publicId: "pay_paid", status: "paid" }, null),
      view({ ...stale, publicId: "pay_nopi", providerRef: null }, null),
      view({ ...stale, publicId: "pay_cash", method: "cash" }, null),
    ]);

    expect(status).toHaveBeenCalledTimes(1);
  });

  it("never throws when a settle fails", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: "pi_boom" });
    status.mockRejectedValue(new Error("stripe down"));
    await expect(svc.settleStaleOnView([view(pay, null)])).resolves.toBeUndefined();
  });
});

describe("payByCard sources", () => {
  beforeEach(async () => { await reset(); vi.resetAllMocks(); flags.taxable = false; flags.noCustomer = false; status.mockResolvedValue(undefined); });
  afterAll(cleanup);
  const saved = (funding: "credit" | "debit" = "credit") => ({ paymentMethodId: "pm_saved", brand: "visa", last4: "4242", funding, expMonth: 1, expYear: 2030, isDefault: true });
  const go = (pay: { publicId: string }, source: Parameters<typeof svc.payByCard>[0]["source"], accept = false) =>
    svc.payByCard({ paymentPublicId: pay.publicId, userPublicId: fx.OWNER, source, acceptSurcharge: accept, returnUrl: "u" });

  it("wallet card skips surcharge", async () => {
    const pay = await makeStripePayment({ amount: "200.00", piId: null, postalCode: "M5H 2N2" });
    preview.mockResolvedValue({ funding: "credit", brand: "visa", last4: "4242", wallet: "apple_pay" });
    create.mockResolvedValue({ status: "succeeded", piId: "pi_w", clientSecret: "cs" });
    status.mockResolvedValue({ piId: "pi_w", status: "succeeded", amountReceivedCents: 20000, currency: "cad", paymentRef: pay.publicId, created: 1 });
    expect(await go(pay, { confirmationTokenId: "ct_w" })).toMatchObject({ kind: "succeeded", receipt: { feeCents: 0, totalCents: 20000 } });
    expect(create.mock.calls[0]![1]).toMatchObject({ amountCents: 20000 });
    const [row] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(row!.surchargeAmount).toBe("0.00");
  });

  it("saved card is charged on-session", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: null, postalCode: "M5H 2N2" });
    cards.mockResolvedValue([saved("debit")]);
    create.mockResolvedValue({ status: "requires_action", piId: "pi_s", clientSecret: "cs" });
    expect((await go(pay, { savedPaymentMethodId: "pm_saved" })).kind).toBe("requires_action");
    expect(create.mock.calls[0]![1]).toMatchObject({ paymentMethodId: "pm_saved", attempt: "0" });
    expect(create.mock.calls[0]![1]).not.toHaveProperty("confirmationTokenId");
    const [row] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(row).toMatchObject({ cardBrand: "visa", cardLast4: "4242" });
  });

  it("saved card fee asks first", async () => {
    const pay = await makeStripePayment({ amount: "200.00", piId: null, postalCode: "M5H 2N2" });
    cards.mockResolvedValue([saved("credit")]);
    expect((await go(pay, { savedPaymentMethodId: "pm_saved" })).kind).toBe("confirm_surcharge");
    expect(create).not.toHaveBeenCalled();
  });

  it("a declined saved card bumps the attempt so a retry reaches the card", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: null, postalCode: "M5H 2N2" });
    cards.mockResolvedValue([saved("debit")]);
    create.mockResolvedValue({ status: "failed", piId: "pi_f", clientSecret: null, reason: "declined" });
    expect((await go(pay, { savedPaymentMethodId: "pm_saved" })).kind).toBe("failed");
    const [row] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(row!.chargeAttempt).toBe(1);
  });

  it("retry after an abandoned 3DS uses a new attempt value", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: null, postalCode: "M5H 2N2" });
    cards.mockResolvedValue([saved("debit")]);
    create.mockResolvedValue({ status: "requires_action", piId: "pi_3ds", clientSecret: "cs" });
    await go(pay, { savedPaymentMethodId: "pm_saved" });
    status.mockResolvedValue({ piId: "pi_3ds", status: "requires_action", amountReceivedCents: 0, currency: "cad", paymentRef: pay.publicId, created: 1 });
    cancel.mockResolvedValue({});
    await svc.abandonCardAttempt(pay.publicId, fx.OWNER);
    status.mockResolvedValue({ piId: "pi_3ds", status: "canceled", amountReceivedCents: 0, currency: "cad", paymentRef: pay.publicId, created: 1 });
    await go(pay, { savedPaymentMethodId: "pm_saved" });
    const attempts = create.mock.calls.map((c) => (c[1] as { attempt: string }).attempt);
    expect(attempts[0]).toBe("0");
    expect(attempts[1]).not.toBe(attempts[0]);
  });

  it("foreign saved card rejected", async () => {
    const pay = await makeStripePayment({ amount: "10.00", piId: null, postalCode: "M5H 2N2" });
    cards.mockResolvedValue([saved("debit")]);
    await expect(go(pay, { savedPaymentMethodId: "pm_other" })).rejects.toThrow(/not available/);
    expect(create).not.toHaveBeenCalled();
  });

  it("listSavedCards returns [] with no Stripe customer", async () => {
    flags.noCustomer = true;
    expect(await svc.listSavedCards(fx.OWNER)).toEqual([]);
    expect(cards).not.toHaveBeenCalled();
  });
});
