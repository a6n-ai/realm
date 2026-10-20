import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq, ne } from "drizzle-orm";
import { nextWeekday, ValidationError } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const publish = vi.hoisted(() => ({ failRefresh: false }));
vi.mock("@/lib/realtime/publish-inbox", async (orig) => {
  const real = await orig<typeof import("@/lib/realtime/publish-inbox")>();
  return { ...real, publishUserRefresh: (id: string) => { if (publish.failRefresh) throw new Error("bus down"); real.publishUserRefresh(id); } };
});

const { db } = await import("@/db/client");
const { addons, deliveries, ledgerEntries, orderActivities, orderAddons, orders, payments, users } = await import("@/db/schema");
const { invalidateCatalogSnapshot, loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { mealSizeAddons } = await import("@/lib/catalog/types");
const { setPaymentConfig } = await import("../app-settings.service");
const { sharedCache } = await import("@/lib/cache");
const { createOrder } = await import("../orders.service");
const { addOrderAddons, quoteOrderAddons } = await import("../order-addons.service");

const PROOF = { path: "payments/test/orig.png", thumbUrl: "https://example.test/thumb.webp", name: "orig.png" };

async function methods(list: { requireProof?: boolean }[] = [{}]) {
  await setPaymentConfig({
    methods: list.map((m) => ({ id: "etransfer", kind: "manual", enabled: true, label: "Interac e-Transfer", payeeHandle: "pay@test.ca", taxes: [], ...m })),
  });
  await sharedCache("app-settings").evictAll();
}

async function reset() {
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
  await setPaymentConfig({ methods: [] });
  await sharedCache("app-settings").evictAll();
}

// A paid, running 1-week plan (5 tiffins), created on the simulated method; a real method is
// switched on afterwards, the way a top-up is recorded against an already-paid plan.
async function runningOrder() {
  const snap = await loadCatalogSnapshot();
  const mealSize = snap.mealSizes.find((m) => !m.trial)!;
  const { publicId } = await createOrder({
    planKey: mealSize.planKey,
    selections: {
      mealSizeId: mealSize.publicId, frequencyKey: "5_day", persons: 1, mealSlots: ["lunch"],
      includeSaturday: false, includeSunday: false, durationWeeks: 1,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: { email: `a${Math.random().toString(36).slice(2)}@test.invalid`, fullName: "Addy", phone: "+16475550123", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  await db.update(orders).set({ status: "active" }).where(eq(orders.publicId, publicId));
  await methods();
  const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  return order;
}

async function anAddon() {
  const addon = mealSizeAddons(await loadCatalogSnapshot())[0];
  if (!addon) throw new Error("Test DB has no add-on a plan offers; seed one (see lib/services/__tests__/catalog-soft-delete.test.ts)");
  return addon;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

type SaveInput = Omit<Parameters<typeof addOrderAddons>[1], "expectedAmountDue">;
// Saves the way the dialog does: the amount staff were shown is the amount they confirm.
async function saveShown(publicId: string, input: SaveInput, actorId: bigint | null = null) {
  const shown = await quoteOrderAddons(publicId, input.selections, input.methodId);
  return addOrderAddons(publicId, { ...input, expectedAmountDue: shown.amountDue }, actorId);
}

describe("order add-ons mid-plan (integration)", () => {
  let seededAddonId: bigint | null = null;

  // The test DB may offer no add-on; seed one on a plan menu that releases its category.
  beforeAll(async () => {
    if (mealSizeAddons(await loadCatalogSnapshot())[0]) return;
    const snap = await loadCatalogSnapshot();
    const plan = snap.plans.find((p) => p.offeredSlots.length > 0)!;
    const [row] = await db.insert(addons).values({ key: "mid-plan-test", name: "Mid Plan Test", category: plan.offeredSlots[0], planId: plan.id, pricePerTiffin: "15.00", maxQty: 5 }).returning({ id: addons.id });
    seededAddonId = row.id;
    await invalidateCatalogSnapshot();
  });
  beforeEach(reset);
  afterAll(async () => {
    await reset();
    if (seededAddonId) {
      await db.delete(addons).where(eq(addons.id, seededAddonId));
      await invalidateCatalogSnapshot();
    }
  });

  it("adds the add-on, bills the open tiffins, and records a paid payment with its ledger credit", async () => {
    const order = await runningOrder();
    const addon = await anAddon();

    const quote = await saveShown(order.publicId, { selections: [{ key: addon.key, qty: 1 }], methodId: "etransfer", proof: PROOF, reference: "CA123" }, order.userId);

    expect(quote.openTiffins).toBe(5);
    expect(quote.addonSubtotal).toBe(round2(addon.pricePerTiffin * 5));
    expect(quote.amountDue).toBe(round2(quote.addonSubtotal + quote.taxTotal));

    const [after] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(Number(after.total)).toBe(round2(Number(order.total) + quote.amountDue));
    expect(Number(after.perTiffinPrice)).toBe(Number(order.perTiffinPrice));
    expect(after.tiffinCount).toBe(order.tiffinCount);
    expect((after.categoryCounts as Record<string, number>)[addon.category]).toBe(((order.categoryCounts as Record<string, number>)[addon.category] ?? 0) + 1);
    expect((after.pricingSnapshot as { total: number }).total).toBe(Number(after.total));

    const rows = await db.select().from(orderAddons).where(eq(orderAddons.orderId, order.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ addonKey: addon.key, qty: 1, amount: quote.addonSubtotal.toFixed(2), createdBy: order.userId });

    const pays = await db.select().from(payments).where(eq(payments.orderId, order.id)).orderBy(asc(payments.id));
    const topUp = pays.at(-1)!;
    expect(topUp).toMatchObject({ status: "paid", method: "etransfer", amount: quote.amountDue.toFixed(2), reference: "CA123", proof: PROOF });
    expect(topUp.capturedAt).not.toBeNull();
    // Never an open payment: that would hold the customer's deliveries.
    expect(pays.some((p) => p.status === "awaiting_payment" || p.status === "pending_verification")).toBe(false);

    const credits = await db.select().from(ledgerEntries).where(eq(ledgerEntries.paymentId, topUp.id));
    expect(credits).toHaveLength(1);
    expect(credits[0]).toMatchObject({ direction: "credit", type: "payment", amount: quote.amountDue.toFixed(2) });

    const acts = await db.select().from(orderActivities).where(eq(orderActivities.orderId, order.id));
    expect(acts.some((a) => a.type === "note" && a.note?.includes(addon.name) && a.note.includes("5 tiffins"))).toBe(true);
    expect(acts.some((a) => a.type === "payment_verified")).toBe(true);
  });

  it("bills only the tiffins not yet past cutoff", async () => {
    const order = await runningOrder();
    const addon = await anAddon();
    const rows = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id)).orderBy(asc(deliveries.deliveryDate));
    await db.update(deliveries).set({ cutoffAt: 1 }).where(eq(deliveries.id, rows[0]!.id));
    await db.update(deliveries).set({ cutoffAt: 1 }).where(eq(deliveries.id, rows[1]!.id));

    const quote = await quoteOrderAddons(order.publicId, [{ key: addon.key, qty: 1 }], "etransfer");

    expect(quote.openTiffins).toBe(3);
    expect(quote.addonSubtotal).toBe(round2(addon.pricePerTiffin * 3));
  });

  it("a quote writes nothing", async () => {
    const order = await runningOrder();
    const addon = await anAddon();
    await quoteOrderAddons(order.publicId, [{ key: addon.key, qty: 1 }], "etransfer");
    expect(await db.select().from(orderAddons).where(eq(orderAddons.orderId, order.id))).toHaveLength(0);
    const [after] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(after.total).toBe(order.total);
  });

  it("rejects when no tiffins are open", async () => {
    const order = await runningOrder();
    const addon = await anAddon();
    await db.update(deliveries).set({ cutoffAt: 1 }).where(eq(deliveries.orderId, order.id));
    await expect(quoteOrderAddons(order.publicId, [{ key: addon.key, qty: 1 }], "etransfer")).rejects.toThrow("no tiffins left");
  });

  it("caps at max_qty including existing rows", async () => {
    const order = await runningOrder();
    const addon = await anAddon();
    await saveShown(order.publicId, { selections: [{ key: addon.key, qty: addon.maxQty }], methodId: "etransfer", proof: PROOF }, null);
    await expect(quoteOrderAddons(order.publicId, [{ key: addon.key, qty: 1 }], "etransfer")).rejects.toThrow(`at most ${addon.maxQty}`);
  });

  it("rejects while a payment is in review", async () => {
    const order = await runningOrder();
    const addon = await anAddon();
    await db.update(payments).set({ status: "awaiting_payment" }).where(eq(payments.orderId, order.id));
    await expect(quoteOrderAddons(order.publicId, [{ key: addon.key, qty: 1 }], "etransfer")).rejects.toThrow("payment is still pending");
  });

  it("requires proof when the method does, and saves nothing", async () => {
    const order = await runningOrder();
    const addon = await anAddon();
    await methods([{ requireProof: true }]);
    await expect(saveShown(order.publicId, { selections: [{ key: addon.key, qty: 1 }], methodId: "etransfer" })).rejects.toThrow("screenshot");
    expect(await db.select().from(orderAddons).where(eq(orderAddons.orderId, order.id))).toHaveLength(0);
    const [after] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(after.total).toBe(order.total);
  });

  it.each(["cancelled", "completed", "pending"] as const)("rejects a %s order", async (status) => {
    const order = await runningOrder();
    const addon = await anAddon();
    await db.update(orders).set({ status }).where(eq(orders.id, order.id));
    await expect(quoteOrderAddons(order.publicId, [{ key: addon.key, qty: 1 }], "etransfer")).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a trial", async () => {
    const order = await runningOrder();
    const addon = await anAddon();
    await db.update(orders).set({ trialLength: 1 }).where(eq(orders.id, order.id));
    await expect(quoteOrderAddons(order.publicId, [{ key: addon.key, qty: 1 }], "etransfer")).rejects.toThrow("trial");
  });

  it("rejects the simulated method and an unknown one", async () => {
    const order = await runningOrder();
    const addon = await anAddon();
    await expect(quoteOrderAddons(order.publicId, [{ key: addon.key, qty: 1 }], "simulated")).rejects.toThrow("payment method");
    await expect(quoteOrderAddons(order.publicId, [{ key: addon.key, qty: 1 }], "bitcoin")).rejects.toThrow("payment method");
  });

  it("rejects an empty or duplicated selection", async () => {
    const order = await runningOrder();
    const addon = await anAddon();
    await expect(quoteOrderAddons(order.publicId, [], "etransfer")).rejects.toThrow("Pick at least one");
    await expect(quoteOrderAddons(order.publicId, [{ key: addon.key, qty: 1 }, { key: addon.key, qty: 1 }], "etransfer")).rejects.toThrow("once");
  });

  it("migrated order: a $0 prepaid plan is charged just the add-on, taxed from the address", async () => {
    const order = await runningOrder();
    const addon = await anAddon();
    await db.delete(ledgerEntries).where(eq(ledgerEntries.orderId, order.id));
    await db.delete(payments).where(eq(payments.orderId, order.id));
    await db.update(orders).set({
      total: "0.00",
      deploymentId: `wc-${order.id}`,
      pricingSnapshot: { lineItems: [{ label: "Prepaid on WordPress", amount: 0 }], adjustments: [], taxLines: [], taxTotal: 0, tiffinCount: 5, perTiffinPrice: 0, subtotal: 0, total: 0, paymentMethodId: "simulated" },
    }).where(eq(orders.id, order.id));

    const quote = await saveShown(order.publicId, { selections: [{ key: addon.key, qty: 1 }], methodId: "etransfer", proof: PROOF }, null);

    expect(quote.taxTotal).toBeGreaterThan(0);
    expect(quote.newTotal).toBe(quote.amountDue);
    const [after] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(Number(after.total)).toBe(quote.amountDue);
  });

  describe("the plan's own payment must be settled (F1)", () => {
    const writes = async (orderId: bigint) => ({
      addons: await db.select().from(orderAddons).where(eq(orderAddons.orderId, orderId)),
      pays: await db.select().from(payments).where(eq(payments.orderId, orderId)),
    });

    it("refuses a rejected-only order and writes nothing", async () => {
      const order = await runningOrder();
      const addon = await anAddon();
      await db.update(payments).set({ status: "rejected" }).where(eq(payments.orderId, order.id));
      const before = await writes(order.id);
      await expect(saveShown(order.publicId, { selections: [{ key: addon.key, qty: 1 }], methodId: "etransfer", proof: PROOF })).rejects.toThrow("payment was rejected");
      const after = await writes(order.id);
      expect(after.addons).toHaveLength(0);
      expect(after.pays).toHaveLength(before.pays.length);
      expect(after.pays.every((p) => p.status === "rejected")).toBe(true);
    });

    it("refuses a refunded-only order", async () => {
      const order = await runningOrder();
      const addon = await anAddon();
      await db.update(payments).set({ status: "refunded" }).where(eq(payments.orderId, order.id));
      await expect(quoteOrderAddons(order.publicId, [{ key: addon.key, qty: 1 }], "etransfer")).rejects.toThrow("no confirmed payment");
    });

    it("refuses a non-WordPress order with no payment rows", async () => {
      const order = await runningOrder();
      const addon = await anAddon();
      await db.delete(ledgerEntries).where(eq(ledgerEntries.orderId, order.id));
      await db.delete(payments).where(eq(payments.orderId, order.id));
      await expect(quoteOrderAddons(order.publicId, [{ key: addon.key, qty: 1 }], "etransfer")).rejects.toThrow("no confirmed payment");
    });

    it("refuses a rejected payment even beside a paid one", async () => {
      const order = await runningOrder();
      const addon = await anAddon();
      const [first] = await db.select().from(payments).where(eq(payments.orderId, order.id));
      await db.insert(payments).values({ orderId: order.id, status: "rejected", method: "etransfer", amount: "1.00", organizationId: order.organizationId });
      expect(first.status).toBe("simulated_paid");
      await expect(quoteOrderAddons(order.publicId, [{ key: addon.key, qty: 1 }], "etransfer")).rejects.toThrow("payment was rejected");
    });
  });

  describe("the amount staff saw is the amount recorded (F2)", () => {
    it("refuses a different expected amount and writes nothing", async () => {
      const order = await runningOrder();
      const addon = await anAddon();
      const shown = await quoteOrderAddons(order.publicId, [{ key: addon.key, qty: 1 }], "etransfer");
      await expect(addOrderAddons(order.publicId, { selections: [{ key: addon.key, qty: 1 }], methodId: "etransfer", proof: PROOF, expectedAmountDue: shown.amountDue + 1 }, null))
        .rejects.toThrow("The amount changed to");
      expect(await db.select().from(orderAddons).where(eq(orderAddons.orderId, order.id))).toHaveLength(0);
      const [after] = await db.select().from(orders).where(eq(orders.id, order.id));
      expect(after.total).toBe(order.total);
      expect(await db.select().from(payments).where(eq(payments.orderId, order.id))).toHaveLength(1);
    });

    it("refuses when a delivery passes cutoff between the quote and the save", async () => {
      const order = await runningOrder();
      const addon = await anAddon();
      const shown = await quoteOrderAddons(order.publicId, [{ key: addon.key, qty: 1 }], "etransfer");
      const [row] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id)).orderBy(asc(deliveries.deliveryDate));
      await db.update(deliveries).set({ cutoffAt: 1 }).where(eq(deliveries.id, row.id));
      await expect(addOrderAddons(order.publicId, { selections: [{ key: addon.key, qty: 1 }], methodId: "etransfer", proof: PROOF, expectedAmountDue: shown.amountDue }, null))
        .rejects.toThrow("The amount changed");
      expect(await db.select().from(orderAddons).where(eq(orderAddons.orderId, order.id))).toHaveLength(0);
    });

    it("writes the server's amount, not the client's, when they match", async () => {
      const order = await runningOrder();
      const addon = await anAddon();
      const shown = await quoteOrderAddons(order.publicId, [{ key: addon.key, qty: 1 }], "etransfer");
      await addOrderAddons(order.publicId, { selections: [{ key: addon.key, qty: 1 }], methodId: "etransfer", proof: PROOF, expectedAmountDue: shown.amountDue }, null);
      const pays = await db.select().from(payments).where(eq(payments.orderId, order.id)).orderBy(asc(payments.id));
      expect(pays.at(-1)!.amount).toBe(shown.amountDue.toFixed(2));
    });
  });

  it("grows the order total from the column, keeping a hand-set difference from the receipt (F3)", async () => {
    const order = await runningOrder();
    const addon = await anAddon();
    const handSet = round2(Number(order.total) + 5);
    await db.update(orders).set({ total: handSet.toFixed(2) }).where(eq(orders.id, order.id));
    const quote = await saveShown(order.publicId, { selections: [{ key: addon.key, qty: 1 }], methodId: "etransfer", proof: PROOF });
    const [after] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(Number(after.total)).toBe(round2(handSet + quote.amountDue));
    expect(quote.newTotal).toBe(Number(after.total));
    expect((after.pricingSnapshot as { total: number }).total).toBe(round2(Number(order.total) + quote.amountDue));
  });

  it("refuses an order with no customer on the quote too (F4)", async () => {
    const order = await runningOrder();
    const addon = await anAddon();
    await db.update(orders).set({ userId: null }).where(eq(orders.id, order.id));
    await expect(quoteOrderAddons(order.publicId, [{ key: addon.key, qty: 1 }], "etransfer")).rejects.toThrow("no customer");
  });

  it("a failing post-commit refresh does not fail the save, so a retry cannot pay twice", async () => {
    const order = await runningOrder();
    const addon = await anAddon();
    publish.failRefresh = true;
    try {
      const quote = await saveShown(order.publicId, { selections: [{ key: addon.key, qty: 1 }], methodId: "etransfer", proof: PROOF });
      expect(quote.amountDue).toBeGreaterThan(0);
    } finally {
      publish.failRefresh = false;
    }
    const pays = await db.select().from(payments).where(eq(payments.orderId, order.id));
    expect(pays.filter((p) => p.note?.startsWith("Add-ons:"))).toHaveLength(1);
    expect(await db.select().from(orderAddons).where(eq(orderAddons.orderId, order.id))).toHaveLength(1);
  });
});
