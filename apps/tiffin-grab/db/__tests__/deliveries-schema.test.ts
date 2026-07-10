import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orders, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

async function reset() {
  await db.delete(deliveries);
  await db.delete(orders);
  await db.delete(users).where(sql`is_system is not true`);
}

async function makeOrder() {
  const snap = await loadCatalogSnapshot();
  const [u] = await db.insert(users).values({ phone: "+16475551000", role: "user" }).returning();
  const [o] = await db.insert(orders).values({
    userId: u.id, planId: snap.plans[0].id, mealSizeId: snap.mealSizes[0].id,
    frequencyId: snap.frequencies.find((f) => f.key === "5_day")!.id,
    persons: 1, mealSlots: ["sabzi"], durationWeeks: 1, startDate: "2030-01-07",
    tiffinCount: 5, perTiffinPrice: "10.00", pricingSnapshot: {}, total: "50.00",
    status: "active", deploymentId: `SUB-${Date.now()}`,
    fullName: "T", addressLine: "1", city: "Toronto", postalCode: "M5V 2T6",
  }).returning();
  return o;
}

describe("deliveries schema", () => {
  beforeEach(reset);
  afterAll(reset);

  it("stores a scheduled delivery with a snapshotted cutoff", async () => {
    const o = await makeOrder();
    const [d] = await db.insert(deliveries)
      .values({ orderId: o.id, deliveryDate: "2030-01-07", cutoffAt: 1234, status: "scheduled" })
      .returning();
    expect(d.status).toBe("scheduled");
    expect(d.cutoffAt).toBe(1234);
    expect(d.makeupForDeliveryId).toBeNull();
  });

  it("rejects two deliveries for the same order on the same date", async () => {
    const o = await makeOrder();
    await db.insert(deliveries).values({ orderId: o.id, deliveryDate: "2030-01-07", cutoffAt: 1 });
    await expect(
      db.insert(deliveries).values({ orderId: o.id, deliveryDate: "2030-01-07", cutoffAt: 2 }),
    ).rejects.toThrow();
  });

  it("allows many NULL makeup_for_delivery_id but only one make-up per source", async () => {
    const o = await makeOrder();
    const [a] = await db.insert(deliveries).values({ orderId: o.id, deliveryDate: "2030-01-07", cutoffAt: 1 }).returning();
    await db.insert(deliveries).values({ orderId: o.id, deliveryDate: "2030-01-08", cutoffAt: 2 }); // 2nd NULL: fine
    await db.insert(deliveries).values({ orderId: o.id, deliveryDate: "2030-01-14", cutoffAt: 3, makeupForDeliveryId: a.id });
    await expect(
      db.insert(deliveries).values({ orderId: o.id, deliveryDate: "2030-01-15", cutoffAt: 4, makeupForDeliveryId: a.id }),
    ).rejects.toThrow();
  });

  it("counts originals via makeup_for_delivery_id IS NULL", async () => {
    const o = await makeOrder();
    const [a] = await db.insert(deliveries).values({ orderId: o.id, deliveryDate: "2030-01-07", cutoffAt: 1 }).returning();
    await db.insert(deliveries).values({ orderId: o.id, deliveryDate: "2030-01-14", cutoffAt: 2, makeupForDeliveryId: a.id });
    const rows = await db.select().from(deliveries)
      .where(and(eq(deliveries.orderId, o.id), isNull(deliveries.makeupForDeliveryId)));
    expect(rows.length).toBe(1);
  });
});
