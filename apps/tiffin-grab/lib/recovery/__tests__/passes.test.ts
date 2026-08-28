import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { nextWeekday } from "@realm/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { orders, payments, orderActivities, ledgerEntries, deliveries, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const svc = await import("@/lib/services/orders.service");
const { TERMINAL_AFTER_MS, terminalizeAbandonedOrders } = await import("../passes");

async function reset() {
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

/** An order created `ageMs` ago whose payment was never claimed. */
async function unpaidOrder(ageMs: number, status: "active" | "waitlisted" = "active") {
  const snap = await loadCatalogSnapshot();
  const { publicId } = await svc.createOrder({
    planKey: snap.plans[0].key,
    selections: {
      mealSizeId: snap.mealSizes[0].publicId, frequencyKey: "5_day", persons: 1, mealSlots: ["lunch"],
      includeSaturday: false, includeSunday: false, durationWeeks: 1,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: { email: `u${Math.random().toString(36).slice(2)}@test.invalid`, fullName: "Jane", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  // createOrder's only payment method in this catalog is "simulated" (settled immediately) —
  // backdate + force the row into the never-claimed state the sweep targets, same as the
  // lifecycle test's status-forcing pattern.
  await db.update(orders).set({ status, createdAt: Date.now() - ageMs }).where(eq(orders.id, order.id));
  await db.update(payments).set({ status: "awaiting_payment" }).where(eq(payments.orderId, order.id));
  return order.id;
}

describe("terminalizeAbandonedOrders (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("cancels an unpaid order past the terminal window", async () => {
    const orderId = await unpaidOrder(TERMINAL_AFTER_MS + 1000);

    expect(await terminalizeAbandonedOrders()).toBe(1);

    const [after] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(after.status).toBe("cancelled");
    const [pay] = await db.select().from(payments).where(eq(payments.orderId, orderId));
    expect(pay.status).toBe("rejected");
  });

  it("cancels an unpaid waitlisted order too", async () => {
    const orderId = await unpaidOrder(TERMINAL_AFTER_MS + 1000, "waitlisted");
    expect(await terminalizeAbandonedOrders()).toBe(1);
    const [after] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(after.status).toBe("cancelled");
  });

  it("leaves a fresh unpaid order alone", async () => {
    await unpaidOrder(TERMINAL_AFTER_MS / 2);
    expect(await terminalizeAbandonedOrders()).toBe(0);
  });

  it("never terminalizes a paid order", async () => {
    const snap = await loadCatalogSnapshot();
    const { publicId } = await svc.createOrder({
      planKey: snap.plans[0].key,
      selections: {
        mealSizeId: snap.mealSizes[0].publicId, frequencyKey: "5_day", persons: 1, mealSlots: ["lunch"],
        includeSaturday: false, includeSunday: false, durationWeeks: 1,
        startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
      },
      contact: { email: `u${Math.random().toString(36).slice(2)}@test.invalid`, fullName: "Jane", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
    });
    const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId));
    await db.update(orders).set({ createdAt: Date.now() - TERMINAL_AFTER_MS - 1000 }).where(eq(orders.id, order.id));
    // payments.status stays simulated_paid from createOrder — never awaiting_payment.
    expect(await terminalizeAbandonedOrders()).toBe(0);
    const [after] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(after.status).toBe("active");
  });

  it("running twice does not re-cancel or double-log the same order", async () => {
    const orderId = await unpaidOrder(TERMINAL_AFTER_MS + 1000);

    expect(await terminalizeAbandonedOrders()).toBe(1);
    expect(await terminalizeAbandonedOrders()).toBe(0);

    const acts = await db.select().from(orderActivities).where(eq(orderActivities.orderId, orderId));
    expect(acts.filter((a) => a.type === "cancelled")).toHaveLength(1);
  });

  it("directly: abandonPendingOrder refuses an order a webhook already settled", async () => {
    const orderId = await unpaidOrder(TERMINAL_AFTER_MS + 1000);
    // Simulate a payment that landed between the sweep's candidate SELECT and this call.
    await db.update(payments).set({ status: "paid" }).where(eq(payments.orderId, orderId));

    expect(await svc.abandonPendingOrder(orderId)).toBe(false);
    const [after] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(after.status).toBe("active");
  });
});
