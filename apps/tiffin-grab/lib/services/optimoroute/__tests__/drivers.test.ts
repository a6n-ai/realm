import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orderActivities, orders, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const sent: { orderNo: string; selectedDriver?: unknown }[] = [];

vi.mock("../client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../client")>();
  return {
    ...actual,
    getRoutes: async () => [],
    createOrder: async (payload: { orderNo: string; selectedDriver?: unknown }) => {
      sent.push(payload);
    },
  };
});

const { listKnownDrivers, assignDriver } = await import("../drivers");

const DATE = (() => {
  const d = new Date(Date.now() + 77 * 86400000);
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
})();

const DEPLOYMENT = "SUB-DRV001";
const USER_PREFIX = "drv";

let deliveryPublicId: string;

async function reset() {
  const mine = await db.select({ id: orders.id }).from(orders).where(eq(orders.deploymentId, DEPLOYMENT));
  const ids = mine.map((o) => o.id);
  if (ids.length) {
    await db.delete(orderActivities).where(inArray(orderActivities.orderId, ids));
    await db.delete(deliveries).where(inArray(deliveries.orderId, ids));
    await db.delete(orders).where(inArray(orders.id, ids));
  }
  await db.delete(users).where(like(users.email, `${USER_PREFIX}%@test.invalid`));
}

describe("listKnownDrivers", () => {
  beforeEach(async () => {
    sent.length = 0;
    await reset();

    const snap = await loadCatalogSnapshot();
    const [u] = await db
      .insert(users)
      .values({
        email: `${USER_PREFIX}${Math.random().toString(36).slice(2)}@test.invalid`,
        role: "user",
      })
      .returning();

    const [o] = await db
      .insert(orders)
      .values({
        userId: u.id,
        planId: snap.plans.find((p) => p.key === "veg")!.id,
        mealSizeId: snap.mealSizes[0].id,
        frequencyId: snap.frequencies.find((f) => f.key === "5_day")!.id,
        persons: 1,
        mealSlots: ["lunch"],
        categoryCounts: { sabzi: 1 },
        durationWeeks: 1,
        startDate: DATE,
        tiffinCount: 5,
        perTiffinPrice: "10.00",
        pricingSnapshot: {},
        total: "50.00",
        status: "active",
        deploymentId: DEPLOYMENT,
        fullName: "Driver Tester",
        addressLine: "1 Queen St",
        city: "Toronto",
        postalCode: "M5H 2N2",
      })
      .returning();

    const rows = await db
      .insert(deliveries)
      .values([
        { orderId: o.id, deliveryDate: DATE, status: "scheduled", cutoffAt: Date.now() + 1e9 },
      ])
      .returning();
    deliveryPublicId = rows[0].publicId;
  });
  afterAll(reset);

  it("returns distinct driverSerial/driverName pairs, excluding nulls", async () => {
    await db
      .update(deliveries)
      .set({ routeDriverSerial: "005", routeDriverName: "Driver 5" })
      .where(eq(deliveries.publicId, deliveryPublicId));

    const result = await listKnownDrivers();
    expect(result).toEqual([{ driverSerial: "005", driverName: "Driver 5" }]);
  });

  it("dedupes a renamed driver serial, keeping the most recently synced name", async () => {
    const orderId = (
      await db.select({ orderId: deliveries.orderId }).from(deliveries).where(eq(deliveries.publicId, deliveryPublicId))
    )[0].orderId;

    const nextDate = new Date(new Date(`${DATE}T00:00:00Z`).getTime() + 7 * 86400000).toISOString().slice(0, 10);
    const [second] = await db
      .insert(deliveries)
      .values({ orderId, deliveryDate: nextDate, status: "scheduled", cutoffAt: Date.now() + 1e9 })
      .returning();

    await db
      .update(deliveries)
      .set({ routeDriverSerial: "005", routeDriverName: "Driver 5", routeSyncedAt: 1000 })
      .where(eq(deliveries.publicId, deliveryPublicId));
    await db
      .update(deliveries)
      .set({ routeDriverSerial: "005", routeDriverName: "Driver Five (renamed)", routeSyncedAt: 2000 })
      .where(eq(deliveries.id, second.id));

    const result = await listKnownDrivers();
    expect(result).toEqual([{ driverSerial: "005", driverName: "Driver Five (renamed)" }]);
  });

  it("a real routeSyncedAt beats a null one, not the reverse (Postgres NULLS FIRST default)", async () => {
    const orderId = (
      await db.select({ orderId: deliveries.orderId }).from(deliveries).where(eq(deliveries.publicId, deliveryPublicId))
    )[0].orderId;

    const nextDate = new Date(new Date(`${DATE}T00:00:00Z`).getTime() + 7 * 86400000).toISOString().slice(0, 10);
    const [second] = await db
      .insert(deliveries)
      .values({ orderId, deliveryDate: nextDate, status: "scheduled", cutoffAt: Date.now() + 1e9 })
      .returning();

    // Null routeSyncedAt (never synced this row's name) vs. a real, older-looking timestamp.
    await db
      .update(deliveries)
      .set({ routeDriverSerial: "005", routeDriverName: "Stale Unsynced Name", routeSyncedAt: null })
      .where(eq(deliveries.publicId, deliveryPublicId));
    await db
      .update(deliveries)
      .set({ routeDriverSerial: "005", routeDriverName: "Driver 5", routeSyncedAt: 1000 })
      .where(eq(deliveries.id, second.id));

    const result = await listKnownDrivers();
    expect(result).toEqual([{ driverSerial: "005", driverName: "Driver 5" }]);
  });

  describe("assignDriver", () => {
    it("merges selectedDriver into the delivery's planned payload and pushes it", async () => {
      await assignDriver(deliveryPublicId, DATE, "005");
      expect(sent).toEqual([
        expect.objectContaining({
          orderNo: deliveryPublicId,
          selectedDriver: { driverSerial: "005" },
        }),
      ]);
    });

    it("throws when the orderNo has no planned delivery for that date", async () => {
      await expect(assignDriver("does-not-exist", DATE, "005")).rejects.toThrow();
    });

    it("logs an activity for the reassignment, same as pushDay/removeStops", async () => {
      const orderId = (
        await db.select({ orderId: deliveries.orderId }).from(deliveries).where(eq(deliveries.publicId, deliveryPublicId))
      )[0].orderId;

      await assignDriver(deliveryPublicId, DATE, "005", 42n);

      const rows = await db
        .select()
        .from(orderActivities)
        .where(eq(orderActivities.orderId, orderId));
      expect(rows).toHaveLength(1);
      expect(rows[0].type).toBe("route_pushed");
      expect(rows[0].note).toContain("005");
      expect(rows[0].createdBy).toBe(42n);
    });
  });
});
