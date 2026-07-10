import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { nextWeekday } from "@realm/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, ledgerEntries, orderActivities, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("@/lib/services/orders.service");
const { skipDelivery } = await import("@/lib/services/deliveries.service");
const { reconcileAllDeliveries } = await import("../reconcile-deliveries");

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
// weekdays-only weeks, all scheduled and comfortably before cutoff.
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

async function nthDelivery(o: { id: bigint }, n: number) {
  const rows = await db.select().from(deliveries).where(eq(deliveries.orderId, o.id)).orderBy(deliveries.deliveryDate);
  return rows[n];
}

describe("reconcileAllDeliveries (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("reconciles every order with a missed, unmaterialized row", async () => {
    const a = await activatedOrder();
    const b = await activatedOrder();
    for (const o of [a, b]) {
      const d = await nthDelivery(o, 0);
      await skipDelivery(d.publicId);
      await db.update(deliveries).set({ cutoffAt: Date.now() - 1 }).where(eq(deliveries.id, d.id));
    }
    const n = await reconcileAllDeliveries();
    expect(n).toBe(2);
    expect(await reconcileAllDeliveries()).toBe(0); // idempotent
  });

  it("returns 0 when nothing is missed", async () => {
    await activatedOrder();
    expect(await reconcileAllDeliveries()).toBe(0);
  });
});
