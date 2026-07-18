import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, isNull, ne } from "drizzle-orm";
import { nextWeekday } from "@realm/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { orders, payments, orderActivities, ledgerEntries, users, deliveries, subscriptionPauses } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const svc = await import("../orders.service");
const { autoResumeIfElapsed } = await import("../orders.service");

async function reset() {
  await db.delete(subscriptionPauses);
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(deliveries);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

async function makeOrder(): Promise<string> {
  const snap = await loadCatalogSnapshot();
  const { publicId } = await svc.createOrder({
    planKey: snap.plans[0].key,
    selections: {
      mealSizeId: snap.mealSizes[0].publicId, frequencyKey: "5_day", persons: 1, mealSlots: ["lunch"],
      includeSaturday: false, includeSunday: false, durationWeeks: 1,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: { fullName: "Jane", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  return publicId;
}

async function orderIdOf(publicId: string): Promise<bigint> {
  const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.publicId, publicId));
  return o.id;
}

describe("OrdersService.pause/resume — limits + recorded pauses (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("records exactly one subscription_pauses row with matching from/until", async () => {
    const publicId = await makeOrder();
    await svc.pauseOrder(publicId, { from: "2000-01-01", until: "2100-01-01" });
    const orderId = await orderIdOf(publicId);
    const rows = await db.select().from(subscriptionPauses).where(eq(subscriptionPauses.orderId, orderId));
    expect(rows).toHaveLength(1);
    expect(rows[0].fromDate).toBe("2000-01-01");
    expect(rows[0].untilDate).toBe("2100-01-01");
    expect(rows[0].isIndefinite).toBe(false);
    expect(rows[0].resumedAt).toBeNull();
  });

  it("throws 'already paused' on a second overlapping pause while one is open", async () => {
    const publicId = await makeOrder();
    // A window in the past covers no future delivery, so the order stays "active" (per the
    // existing narrower-window behavior) while the pause row it records stays open — exercising
    // the one-open-pause guard independent of the order-status guard.
    await svc.pauseOrder(publicId, { from: "2000-01-01", until: "2000-01-02" });
    const orderId = await orderIdOf(publicId);
    const [order] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId));
    expect(order.status).toBe("active");
    await expect(svc.pauseOrder(publicId, { from: "2000-01-03", until: "2000-01-04" })).rejects.toThrow("already paused");
  });

  it("resume stamps resumedAt and a subsequent pause is allowed again", async () => {
    const publicId = await makeOrder();
    await svc.pauseOrder(publicId, { from: "2000-01-01", until: "2100-01-01" });
    const orderId = await orderIdOf(publicId);
    await svc.resumeOrder(publicId);

    const [closed] = await db.select().from(subscriptionPauses).where(eq(subscriptionPauses.orderId, orderId));
    expect(closed.resumedAt).not.toBeNull();

    // Order is active again after resume, so a fresh pause is legal.
    await svc.pauseOrder(publicId, { from: "2000-01-01", until: "2100-01-01" });
    const rows = await db.select().from(subscriptionPauses).where(eq(subscriptionPauses.orderId, orderId));
    expect(rows).toHaveLength(2);
    const open = rows.filter((r) => r.resumedAt == null);
    expect(open).toHaveLength(1);
  });

  it("indefinite pause sets untilDate to last delivery date, isIndefinite=true, and flips order to paused", async () => {
    const publicId = await makeOrder();
    const orderId = await orderIdOf(publicId);
    const lastDelivery = await db.select({ d: deliveries.deliveryDate }).from(deliveries)
      .where(eq(deliveries.orderId, orderId)).orderBy(deliveries.deliveryDate);
    const expectedLast = lastDelivery[lastDelivery.length - 1].d;

    await svc.pauseOrder(publicId, { from: "2000-01-01", until: "2000-01-01", indefinite: true });

    const [row] = await db.select().from(subscriptionPauses).where(eq(subscriptionPauses.orderId, orderId));
    expect(row.isIndefinite).toBe(true);
    expect(row.untilDate).toBe(expectedLast);
    const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(o.status).toBe("paused");
  });

  it("autoResumeIfElapsed flips a fully-paused order whose open pause is elapsed back to active", async () => {
    const publicId = await makeOrder();
    const orderId = await orderIdOf(publicId);
    // Pause a window fully in the past relative to "today" so untilDate < today.
    await svc.pauseOrder(publicId, { from: "2000-01-01", until: "2000-01-02" });
    // Force the order into "paused" and the pause row's untilDate into the past
    // directly — pauseRange only pauses future rows, so simulate the elapsed state.
    await db.update(orders).set({ status: "paused" }).where(eq(orders.id, orderId));
    await db.update(subscriptionPauses)
      .set({ untilDate: "2000-01-02" })
      .where(and(eq(subscriptionPauses.orderId, orderId), isNull(subscriptionPauses.resumedAt)));

    await autoResumeIfElapsed(orderId);

    const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(o.status).toBe("active");
    const [pauseRow] = await db.select().from(subscriptionPauses).where(eq(subscriptionPauses.orderId, orderId));
    expect(pauseRow.resumedAt).not.toBeNull();
  });

  it("autoResumeIfElapsed leaves an indefinite pause untouched", async () => {
    const publicId = await makeOrder();
    const orderId = await orderIdOf(publicId);
    await svc.pauseOrder(publicId, { from: "2000-01-01", until: "2000-01-01", indefinite: true });
    await autoResumeIfElapsed(orderId);
    const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(o.status).toBe("paused");
  });
});
