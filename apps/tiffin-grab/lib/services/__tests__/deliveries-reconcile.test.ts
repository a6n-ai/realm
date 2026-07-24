import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { nextWeekday } from "@realm/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, ledgerEntries, orderActivities, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../orders.service");
const { reconcilePoolFromMisses, skipDelivery } = await import("../deliveries.service");

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

async function pooledCount(o: { id: bigint }) {
  const [row] = await db.select({ n: orders.pooledTiffinCount }).from(orders).where(eq(orders.id, o.id));
  return row.n;
}

describe("reconcilePoolFromMisses (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("pools nothing before cutoff, exactly one tiffin after — and creates no make-up date", async () => {
    const o = await activatedOrder(); // N = 10, persons = 1
    const d = await nthDelivery(o, 0);
    await skipDelivery(d.publicId, 1n);
    expect(await reconcilePoolFromMisses(o.id)).toBe(0); // cutoff not passed
    expect(await pooledCount(o)).toBe(0);
    await db.update(deliveries).set({ cutoffAt: Date.now() - 1 }).where(eq(deliveries.id, d.id));
    expect(await reconcilePoolFromMisses(o.id)).toBe(1);
    expect(await reconcilePoolFromMisses(o.id)).toBe(0); // idempotent
    expect(await pooledCount(o)).toBe(1);
    const [miss] = await db.select().from(deliveries).where(eq(deliveries.id, d.id));
    expect(miss.pooledAt).not.toBeNull();
    // no make-up date was created
    const makeups = await db.select().from(deliveries)
      .where(and(eq(deliveries.orderId, o.id), isNotNull(deliveries.makeupForDeliveryId)));
    expect(makeups.length).toBe(0);
  });

  it("two missed rows pool two tiffins", async () => {
    const o = await activatedOrder();
    const [a, b] = [await nthDelivery(o, 0), await nthDelivery(o, 1)];
    await skipDelivery(a.publicId, 1n);
    await skipDelivery(b.publicId, 1n);
    await db.update(deliveries).set({ cutoffAt: Date.now() - 1 })
      .where(inArray(deliveries.id, [a.id, b.id]));
    expect(await reconcilePoolFromMisses(o.id)).toBe(2);
    expect(await pooledCount(o)).toBe(2);
  });

  it("a legacy make-up child leaves its original unpooled (entitlement already on the calendar)", async () => {
    const o = await activatedOrder();
    const d = await nthDelivery(o, 0);
    // Simulate the old auto-make-up: skipped original past cutoff WITH a make-up child.
    await db.update(deliveries).set({ status: "skipped", cutoffAt: Date.now() - 1 }).where(eq(deliveries.id, d.id));
    await db.insert(deliveries).values({
      orderId: o.id, deliveryDate: "2030-01-21", status: "scheduled",
      cutoffAt: Date.now() + 1e9, makeupForDeliveryId: d.id,
    });
    expect(await reconcilePoolFromMisses(o.id)).toBe(0);
    expect(await pooledCount(o)).toBe(0);
  });

  it("a paused row past cutoff pools a tiffin too", async () => {
    const o = await activatedOrder();
    const d = await nthDelivery(o, 0);
    await db.update(deliveries).set({ status: "paused", cutoffAt: Date.now() - 1 }).where(eq(deliveries.id, d.id));
    expect(await reconcilePoolFromMisses(o.id)).toBe(1);
    expect(await pooledCount(o)).toBe(1);
  });

  it("keeps count(originals) === N across skip -> cutoff -> reconcile (pooling adds no rows)", async () => {
    const o = await activatedOrder(); // N = 10
    const originals = () => db.select().from(deliveries)
      .where(and(eq(deliveries.orderId, o.id), isNull(deliveries.makeupForDeliveryId)));
    expect((await originals()).length).toBe(10);
    const d = await nthDelivery(o, 0);
    await skipDelivery(d.publicId, 1n);
    await db.update(deliveries).set({ cutoffAt: Date.now() - 1 }).where(eq(deliveries.id, d.id));
    await reconcilePoolFromMisses(o.id);
    expect((await originals()).length).toBe(10); // pooling never inserts rows
  });

  it("returns 0 for a cancelled order", async () => {
    const o = await activatedOrder();
    const d = await nthDelivery(o, 0);
    await skipDelivery(d.publicId, 1n);
    await db.update(deliveries).set({ cutoffAt: Date.now() - 1 }).where(eq(deliveries.id, d.id));
    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, o.id));
    expect(await reconcilePoolFromMisses(o.id)).toBe(0);
    expect(await pooledCount(o)).toBe(0);
  });

  it("returns 0 for a completed order (defense in depth)", async () => {
    const o = await activatedOrder();
    const d = await nthDelivery(o, 0);
    await skipDelivery(d.publicId, 1n);
    await db.update(deliveries).set({ cutoffAt: Date.now() - 1 }).where(eq(deliveries.id, d.id));
    await db.update(orders).set({ status: "completed" }).where(eq(orders.id, o.id));
    expect(await reconcilePoolFromMisses(o.id)).toBe(0);
    expect(await pooledCount(o)).toBe(0);
  });
});
