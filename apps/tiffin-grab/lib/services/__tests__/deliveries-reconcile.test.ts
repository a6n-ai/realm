import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { nextWeekday } from "@realm/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, ledgerEntries, orderActivities, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../orders.service");
const { reconcileMakeups, skipDelivery } = await import("../deliveries.service");

async function reset() {
  await db.delete(deliveries);
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

async function makeOrder() {
  const snap = await loadCatalogSnapshot();
  const { publicId } = await createOrder({
    planKey: snap.plans[0].key,
    selections: {
      mealSizeId: snap.mealSizes[0].publicId,
      frequencyKey: "5_day",
      persons: 1,
      mealSlots: ["lunch"],
      includeSaturday: false,
      includeSunday: false,
      durationWeeks: 1,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    // M5V is a seeded Toronto zone -> order lands "active", giving us a real orderId to attach rows to.
    contact: { fullName: "A B", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  const [o] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  return o;
}

// Replaces whatever materializeDeliveries produced with 10 deterministic rows spanning two fixed
// weekdays-only weeks (2030-01-07..11, 2030-01-14..18), all scheduled and comfortably before cutoff.
async function activatedOrder() {
  const o = await makeOrder();
  await db.delete(deliveries).where(eq(deliveries.orderId, o.id));
  const dates = [
    "2030-01-07", "2030-01-08", "2030-01-09", "2030-01-10", "2030-01-11",
    "2030-01-14", "2030-01-15", "2030-01-16", "2030-01-17", "2030-01-18",
  ];
  await db.insert(deliveries).values(dates.map((deliveryDate) => ({
    orderId: o.id,
    deliveryDate,
    status: "scheduled" as const,
    cutoffAt: Date.now() + 1e9,
  })));
  return o;
}

async function rowsFor(o: { id: bigint }) {
  return db.select().from(deliveries).where(eq(deliveries.orderId, o.id)).orderBy(asc(deliveries.deliveryDate));
}

async function nthDelivery(o: { id: bigint }, n: number) {
  const rows = await rowsFor(o);
  return rows[n];
}

describe("reconcileMakeups (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("spawns nothing before cutoff, exactly one after", async () => {
    const o = await activatedOrder(); // N = 10
    const d = await nthDelivery(o, 0);
    await skipDelivery(d.publicId);
    expect(await reconcileMakeups(o.id)).toBe(0); // cutoff not passed
    await db.update(deliveries).set({ cutoffAt: Date.now() - 1 }).where(eq(deliveries.id, d.id));
    expect(await reconcileMakeups(o.id)).toBe(1);
    expect(await reconcileMakeups(o.id)).toBe(0); // idempotent
    const [mk] = await db.select().from(deliveries).where(eq(deliveries.makeupForDeliveryId, d.id));
    expect(mk.status).toBe("scheduled");
  });

  it("two missed rows produce two make-ups on distinct dates", async () => {
    const o = await activatedOrder();
    const [a, b] = [await nthDelivery(o, 0), await nthDelivery(o, 1)];
    await skipDelivery(a.publicId);
    await skipDelivery(b.publicId);
    await db.update(deliveries).set({ cutoffAt: Date.now() - 1 })
      .where(inArray(deliveries.id, [a.id, b.id]));
    expect(await reconcileMakeups(o.id)).toBe(2);
    const mks = await db.select().from(deliveries)
      .where(and(eq(deliveries.orderId, o.id), isNotNull(deliveries.makeupForDeliveryId)));
    expect(new Set(mks.map((m) => m.deliveryDate)).size).toBe(2);
  });

  it("a missed make-up spawns nothing (make-ups are terminal)", async () => {
    const o = await activatedOrder();
    const d = await nthDelivery(o, 0);
    await skipDelivery(d.publicId);
    await db.update(deliveries).set({ cutoffAt: Date.now() - 1 }).where(eq(deliveries.id, d.id));
    await reconcileMakeups(o.id);
    await db.update(deliveries).set({ status: "skipped", cutoffAt: Date.now() - 1 })
      .where(and(eq(deliveries.orderId, o.id), isNotNull(deliveries.makeupForDeliveryId)));
    expect(await reconcileMakeups(o.id)).toBe(0);
  });

  it("a paused row past cutoff produces a make-up too", async () => {
    const o = await activatedOrder();
    const d = await nthDelivery(o, 0);
    await db.update(deliveries).set({ status: "paused", cutoffAt: Date.now() - 1 }).where(eq(deliveries.id, d.id));
    expect(await reconcileMakeups(o.id)).toBe(1);
    const [mk] = await db.select().from(deliveries).where(eq(deliveries.makeupForDeliveryId, d.id));
    expect(mk.status).toBe("scheduled");
  });

  it("keeps count(originals) === N across skip -> cutoff -> reconcile", async () => {
    const o = await activatedOrder(); // N = 10
    const originals = () => db.select().from(deliveries)
      .where(and(eq(deliveries.orderId, o.id), isNull(deliveries.makeupForDeliveryId)));
    expect((await originals()).length).toBe(10);
    const d = await nthDelivery(o, 0);
    await skipDelivery(d.publicId);
    await db.update(deliveries).set({ cutoffAt: Date.now() - 1 }).where(eq(deliveries.id, d.id));
    await reconcileMakeups(o.id);
    expect((await originals()).length).toBe(10); // make-up is not an original
  });

  it("returns 0 for a cancelled order", async () => {
    const o = await activatedOrder();
    const d = await nthDelivery(o, 0);
    await skipDelivery(d.publicId);
    await db.update(deliveries).set({ cutoffAt: Date.now() - 1 }).where(eq(deliveries.id, d.id));
    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, o.id));
    expect(await reconcileMakeups(o.id)).toBe(0);
    const [mk] = await db.select().from(deliveries).where(eq(deliveries.makeupForDeliveryId, d.id));
    expect(mk).toBeUndefined();
  });
});
