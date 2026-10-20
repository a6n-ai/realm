import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const status = vi.fn();
const preview = vi.fn();
const create = vi.fn();
const refund = vi.fn();
const retrieve = vi.fn();
const cancelIntent = vi.fn();
const stripeTax = vi.fn();
const verify = vi.fn();
const list = vi.fn();
const logError = vi.fn();
// Settle logs on purpose (e.g. a paid add-on that cannot be applied); captured here and asserted where expected.
vi.mock("@foundry/commons/logger", async (orig) => {
  const quiet: object = new Proxy({}, { get: (_, k) => (k === "error" ? logError : () => quiet) });
  return { ...(await orig<object>()), createLogger: () => quiet };
});
vi.mock("@/lib/payments/stripe", async (orig) => ({
  ...(await orig<object>()),
  stripeRuntime: async () => ({
    stripe: { paymentIntents: { cancel: (...a: unknown[]) => cancelIntent(...a), retrieve: (...a: unknown[]) => retrieve(...a) } },
    cfg: {
      surcharge: { enabled: true, ratePct: 2.4, excludeProvinces: ["QC"], networksNotifiedOn: "2026-09-01" },
      tax: { enabled: true, taxCode: "txcd_x", surchargeTaxable: true },
    },
  }),
  customerStore: { get: async () => "cus_test", set: async () => {} },
}));
vi.mock("@foundry/payments/stripe", async (orig) => ({
  ...(await orig<object>()),
  fetchIntentStatus: (...a: unknown[]) => status(...a),
  previewConfirmationToken: (...a: unknown[]) => preview(...a),
  createAndConfirmIntent: (...a: unknown[]) => create(...a),
  ensureCustomer: async () => "cus_test",
  listIntents: (...a: unknown[]) => list(...a),
  refundIntent: (...a: unknown[]) => refund(...a),
}));
vi.mock("@/lib/tax/checkout-taxes", async (orig) => ({ ...(await orig<object>()), stripeTaxFor: (...a: unknown[]) => stripeTax(...a) }));
vi.mock("@/lib/services/orders.service", async (orig) => {
  const real = await orig<typeof import("@/lib/services/orders.service")>();
  verify.mockImplementation(real.verifyPayment);
  return { ...real, verifyPayment: (...a: Parameters<typeof real.verifyPayment>) => verify(...a) };
});

const { db } = await import("@/db/client");
const { addons, deliveries, orderAddons, orders, payments } = await import("@/db/schema");
const { invalidateCatalogSnapshot, loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { mealSizeAddons } = await import("@/lib/catalog/types");
const { setPaymentConfig } = await import("../app-settings.service");
const { sharedCache } = await import("@/lib/cache");
const { createOrder } = await import("../orders.service");
const { addOrderAddons, quoteOrderAddons } = await import("../order-addons.service");
const { reconcileStripe, settleStripePayment } = await import("../payment-stripe");
const { toCents } = await import("@/lib/payments/stripe");
const fx = await import("./stripe-fixture");

const intent = (pay: { publicId: string; amount: string }, piId: string) => ({
  piId, status: "succeeded", amountReceivedCents: toCents(pay.amount), currency: "cad", paymentRef: pay.publicId, created: 1,
});

async function reconcileOne(pay: { publicId: string; amount: string }, piId: string) {
  await db.update(payments).set({ providerRef: piId }).where(eq(payments.publicId, pay.publicId));
  status.mockResolvedValue(intent(pay, piId));
  list.mockResolvedValue({ nextCursor: null, items: [intent(pay, piId)] });
  const { rows } = await reconcileStripe({ from: 0, to: Date.now() + 60_000 });
  return rows.find((r) => r.kind === "unpaid_here");
}

describe("Reconcile settle starts orders and applies add-ons", () => {
  let seededAddonId: bigint | null = null;
  beforeAll(async () => {
    if (mealSizeAddons(await loadCatalogSnapshot())[0]) return;
    const snap = await loadCatalogSnapshot();
    const plan = snap.plans.find((p) => p.offeredSlots.length > 0)!;
    const [row] = await db.insert(addons).values({ key: "mid-plan-stripe-test", name: "Mid Plan Stripe Test", category: plan.offeredSlots[0], planId: plan.id, pricePerTiffin: "15.00", maxQty: 5 }).returning({ id: addons.id });
    seededAddonId = row!.id;
    await invalidateCatalogSnapshot();
  });
  beforeEach(async () => {
    await db.delete(orderAddons);
    await fx.reset();
    vi.clearAllMocks();
    stripeTax.mockResolvedValue(null);
    retrieve.mockResolvedValue({ latest_charge: null });
    await setPaymentConfig({
      methods: [
        { id: "etransfer", kind: "manual", enabled: true, label: "e-Transfer", payeeHandle: "p@x.ca", taxes: [] },
        { id: "stripe", kind: "online", enabled: true, label: "Card", taxes: [] },
      ],
    });
    await sharedCache("app-settings").evictAll();
  });
  afterAll(async () => {
    await db.delete(orderAddons);
    await fx.cleanup();
    if (seededAddonId) {
      await db.delete(addons).where(eq(addons.id, seededAddonId));
      await invalidateCatalogSnapshot();
    }
  });

  it("starts a pending Stripe order", async () => {
    const { publicId } = await createOrder(await fx.baseInput({ paymentMethodId: "stripe" }));
    const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId));
    expect(order!.status).toBe("pending");
    const [pay] = await db.select().from(payments).where(eq(payments.orderId, order!.id));
    const row = await reconcileOne(pay!, "pi_start");
    expect(row).toMatchObject({ kind: "unpaid_here", effect: "start" });

    expect(await settleStripePayment({ paymentRef: pay!.publicId }, "reconcile")).toBe("paid");
    const [after] = await db.select().from(orders).where(eq(orders.id, order!.id));
    expect(after!.status).toBe("active");
    expect(await db.select().from(deliveries).where(eq(deliveries.orderId, order!.id))).not.toHaveLength(0);
  });

  it("applies the add-ons of a paid link", async () => {
    const { publicId } = await createOrder(await fx.baseInput({ paymentMethodId: "etransfer" }));
    const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId));
    expect(order!.status).toBe("active");
    await db.update(payments).set({ status: "paid" }).where(eq(payments.orderId, order!.id));
    const addon = mealSizeAddons(await loadCatalogSnapshot())[0]!;
    const selections = [{ key: addon.key, qty: 1 }];
    const shown = await quoteOrderAddons(publicId, selections, "stripe");
    const res = await addOrderAddons(publicId, { selections, methodId: "stripe", expectedAmountDue: shown.amountDue }, null);
    const [pay] = await db.select().from(payments).where(eq(payments.publicId, res.paymentPublicId!));
    const row = await reconcileOne(pay!, "pi_addon");
    expect(row).toMatchObject({ kind: "unpaid_here", effect: "addons" });

    expect(await settleStripePayment({ paymentRef: pay!.publicId }, "reconcile")).toBe("paid");
    expect(await db.select().from(orderAddons).where(eq(orderAddons.orderId, order!.id))).not.toHaveLength(0);
  });

  it("leaves WordPress-migrated pending orders plain", async () => {
    const { publicId } = await createOrder(await fx.baseInput({ paymentMethodId: "stripe" }));
    await db.update(orders).set({ deploymentId: "wc-1" }).where(eq(orders.publicId, publicId));
    const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId));
    const [pay] = await db.select().from(payments).where(eq(payments.orderId, order!.id));
    expect(await reconcileOne(pay!, "pi_wc")).toMatchObject({ kind: "unpaid_here", effect: "plain" });
  });

  it("labels a void add-on link plain", async () => {
    const { publicId } = await createOrder(await fx.baseInput({ paymentMethodId: "etransfer" }));
    const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId));
    await db.update(payments).set({ status: "paid" }).where(eq(payments.orderId, order!.id));
    const addon = mealSizeAddons(await loadCatalogSnapshot())[0]!;
    const selections = [{ key: addon.key, qty: 1 }];
    const shown = await quoteOrderAddons(publicId, selections, "stripe");
    const res = await addOrderAddons(publicId, { selections, methodId: "stripe", expectedAmountDue: shown.amountDue }, null);
    const [pay] = await db.select().from(payments).where(eq(payments.publicId, res.paymentPublicId!));
    await db.update(payments).set({ expiresAt: 0 }).where(eq(payments.id, pay!.id));
    expect(await reconcileOne(pay!, "pi_void")).toMatchObject({ kind: "unpaid_here", effect: "plain" });
  });
});
