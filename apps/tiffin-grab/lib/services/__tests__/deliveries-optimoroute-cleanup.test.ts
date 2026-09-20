import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const deleted: string[] = [];
let failNext = false;

vi.mock("@/lib/services/optimoroute/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/optimoroute/client")>();
  return {
    ...actual,
    deleteOrder: async (orderNo: string) => {
      if (failNext) {
        failNext = false;
        throw new Error("OptimoRoute refused the delete");
      }
      deleted.push(orderNo);
    },
  };
});

const { db } = await import("@/db/client");
const { deliveries, ledgerEntries, orderActivities, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder, cancelOrder } = await import("../orders.service");
const { skipDelivery, rescheduleDelivery, pauseRange } = await import("../deliveries.service");

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
    contact: { email: `u${Math.random().toString(36).slice(2)}@test.invalid`, fullName: "A B", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  const [o] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  return o;
}

describe("OptimoRoute cleanup on skip/cancel", () => {
  beforeEach(async () => {
    deleted.length = 0;
    failNext = false;
    await reset();
  });
  afterAll(reset);

  it("skipDelivery deletes the row from OptimoRoute when it was previously synced", async () => {
    const o = await makeOrder();
    const [d] = await db.select().from(deliveries).where(eq(deliveries.orderId, o.id)).limit(1);
    await db.update(deliveries).set({ routeSyncedAt: 1000 }).where(eq(deliveries.id, d.id));

    await skipDelivery(d.publicId, 1n);

    expect(deleted).toEqual([d.publicId]);
  });

  it("skipDelivery does not call OptimoRoute for a row that was never synced", async () => {
    const o = await makeOrder();
    const [d] = await db.select().from(deliveries).where(eq(deliveries.orderId, o.id)).limit(1);

    await skipDelivery(d.publicId, 1n);

    expect(deleted).toEqual([]);
  });

  it("skipDelivery still succeeds when the OptimoRoute delete call fails", async () => {
    const o = await makeOrder();
    const [d] = await db.select().from(deliveries).where(eq(deliveries.orderId, o.id)).limit(1);
    await db.update(deliveries).set({ routeSyncedAt: 1000 }).where(eq(deliveries.id, d.id));
    failNext = true;

    await expect(skipDelivery(d.publicId, 1n)).resolves.toEqual({ missedDates: expect.any(Array) });
    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, d.id));
    expect(row.status).toBe("skipped");
  });

  it("cancelling an order deletes only the previously-synced deliveries from OptimoRoute", async () => {
    const o = await makeOrder();
    const rows = await db.select().from(deliveries).where(eq(deliveries.orderId, o.id));
    expect(rows.length).toBeGreaterThan(1);
    await db.update(deliveries).set({ routeSyncedAt: 1000 }).where(eq(deliveries.id, rows[0].id));

    await cancelOrder(o.publicId);

    expect(deleted).toEqual([rows[0].publicId]);
  });

  it("reschedule deletes the old stop; a merge onto a synced stop never throws when the refresh push fails", async () => {
    const o = await makeOrder();
    const rows = (await db.select().from(deliveries).where(eq(deliveries.orderId, o.id))).sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
    await db.update(deliveries).set({ routeSyncedAt: 1000 }).where(eq(deliveries.orderId, o.id));

    const res = await rescheduleDelivery(rows[0].publicId, rows[1].deliveryDate, 1n);

    expect(res.merged).toBe(true);
    expect(deleted).toEqual([rows[0].publicId]);
  });

  it("pausing a range deletes the synced stops it pauses", async () => {
    const o = await makeOrder();
    const rows = (await db.select().from(deliveries).where(eq(deliveries.orderId, o.id))).sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
    await db.update(deliveries).set({ routeSyncedAt: 1000 }).where(eq(deliveries.id, rows[1].id));

    await pauseRange(o.publicId, rows[1].deliveryDate, rows[1].deliveryDate);

    expect(deleted).toEqual([rows[1].publicId]);
  });
});
