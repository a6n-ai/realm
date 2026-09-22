import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orderActivities, orders, payments, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const sent: { orderNo: string }[] = [];
const deleted: string[] = [];

vi.mock("../client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../client")>();
  return {
    ...actual,
    getRoutes: async () => [],
    createOrder: async (payload: { orderNo: string }) => {
      sent.push(payload);
    },
    deleteOrder: async (orderNo: string) => {
      deleted.push(orderNo);
    },
  };
});

const { pushOneDelivery, removeOneDelivery } = await import("../push");

const DATE = (() => {
  const d = new Date(Date.now() + 77 * 86400000);
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
})();

const DEPLOYMENT = "SUB-PM001";
const USER_PREFIX = "pm";

let deliveryPublicId: string;
let orderId: bigint;

async function reset() {
  const mine = await db.select({ id: orders.id }).from(orders).where(eq(orders.deploymentId, DEPLOYMENT));
  const ids = mine.map((o) => o.id);
  if (ids.length) {
    await db.delete(orderActivities).where(inArray(orderActivities.orderId, ids));
    await db.delete(payments).where(inArray(payments.orderId, ids));
    await db.delete(deliveries).where(inArray(deliveries.orderId, ids));
    await db.delete(orders).where(inArray(orders.id, ids));
  }
  await db.delete(users).where(like(users.email, `${USER_PREFIX}%@test.invalid`));
}

describe("pushOneDelivery / removeOneDelivery", () => {
  beforeEach(async () => {
    sent.length = 0;
    deleted.length = 0;
    await reset();

    const snap = await loadCatalogSnapshot();
    const [u] = await db
      .insert(users)
      .values({ email: `${USER_PREFIX}${Math.random().toString(36).slice(2)}@test.invalid`, role: "user" })
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
        fullName: "Manual Push Tester",
        addressLine: "1 Queen St",
        city: "Toronto",
        postalCode: "M5H 2N2",
      })
      .returning();
    orderId = o.id;

    await db.insert(payments).values({
      orderId: o.id, amount: o.total, status: "simulated_paid", method: "simulated", capturedAt: Date.now(),
    });

    const rows = await db
      .insert(deliveries)
      .values([{ orderId: o.id, deliveryDate: DATE, status: "scheduled", cutoffAt: Date.now() + 1e9 }])
      .returning();
    deliveryPublicId = rows[0].publicId;
  });
  afterAll(reset);

  it("pushOneDelivery sends only the targeted delivery's payload and logs an activity", async () => {
    await pushOneDelivery(deliveryPublicId, DATE, 1n);

    expect(sent).toEqual([expect.objectContaining({ orderNo: deliveryPublicId })]);
    const activities = await db.select().from(orderActivities).where(eq(orderActivities.orderId, orderId));
    expect(activities).toHaveLength(1);
    expect(activities[0].type).toBe("route_pushed");
  });

  it("pushOneDelivery throws when the delivery isn't scheduled for that date", async () => {
    await expect(pushOneDelivery("does-not-exist", DATE, 1n)).rejects.toThrow();
    expect(sent).toEqual([]);
  });

  it("removeOneDelivery deletes regardless of staleness and logs an activity", async () => {
    await removeOneDelivery(deliveryPublicId, DATE, 1n);

    expect(deleted).toEqual([deliveryPublicId]);
    const activities = await db.select().from(orderActivities).where(eq(orderActivities.orderId, orderId));
    expect(activities).toHaveLength(1);
    expect(activities[0].note).toBe("Removed from OptimoRoute (manual)");
  });
});
