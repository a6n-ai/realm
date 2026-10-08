import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { nextWeekday, ValidationError } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/services/optimoroute/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/optimoroute/client")>();
  return { ...actual, deleteOrder: vi.fn(async () => undefined) };
});

const { db } = await import("@/db/client");
const { deliveries, ledgerEntries, orderActivities, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../orders.service");
const { adminSetDeliveryStatus } = await import("../deliveries.service");
const { deleteOrder } = await import("@/lib/services/optimoroute/client");

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

async function seedDelivery(orderId: bigint, overrides: Partial<typeof deliveries.$inferInsert> = {}) {
  const [row] = await db.insert(deliveries).values({
    orderId,
    deliveryDate: "2026-01-07",
    status: "scheduled",
    cutoffAt: 1,
    tiffinUnits: 1,
    ...overrides,
  }).returning();
  return row;
}

describe("adminSetDeliveryStatus", () => {
  beforeEach(reset);
  afterAll(reset);

  it("puts a past delivery on hold, and never releases it", async () => {
    const order = await makeOrder();
    const row = await seedDelivery(order.id, { optimoCompletionStatus: "success", optimoCompletedAt: 5 });

    await adminSetDeliveryStatus(row.publicId, "not_delivered", 1n);
    const [skipped] = await db.select().from(deliveries).where(eq(deliveries.id, row.id));
    expect([skipped.status, skipped.optimoCompletionStatus]).toEqual(["skipped", null]);

    await expect(adminSetDeliveryStatus(row.publicId, "delivered", 1n)).rejects.toThrow("can't go back to this day");
    await expect(adminSetDeliveryStatus(row.publicId, "upcoming", 1n)).rejects.toThrow("can't go back to this day");
  });

  it("corrects an OptimoRoute failure back to delivered", async () => {
    const order = await makeOrder();
    const row = await seedDelivery(order.id, { status: "skipped", optimoCompletionStatus: "failed", optimoCompletedAt: 5 });

    await adminSetDeliveryStatus(row.publicId, "delivered", 1n);
    const [delivered] = await db.select().from(deliveries).where(eq(deliveries.id, row.id));
    expect([delivered.status, delivered.optimoCompletionStatus]).toEqual(["scheduled", "success"]);
  });

  it("puts a confirmed past delivery back to awaiting confirmation", async () => {
    const order = await makeOrder();
    const row = await seedDelivery(order.id);
    await adminSetDeliveryStatus(row.publicId, "delivered", 1n);
    await adminSetDeliveryStatus(row.publicId, "upcoming", 1n);
    const [updated] = await db.select().from(deliveries).where(eq(deliveries.id, row.id));
    expect(updated.optimoCompletionStatus).toBeNull();
    expect(updated.status).toBe("scheduled");
  });

  it("refuses Delivered before the delivery's day", async () => {
    const order = await makeOrder();
    const row = await seedDelivery(order.id, { cutoffAt: Date.now() + 1e9, deliveryDate: "2030-06-02" });
    await expect(adminSetDeliveryStatus(row.publicId, "delivered", 1n)).rejects.toBeInstanceOf(ValidationError);
  });

  it("removes a synced stop from OptimoRoute when marked not delivered", async () => {
    const order = await makeOrder();
    const row = await seedDelivery(order.id, { routeSyncedAt: Date.now(), cutoffAt: Date.now() + 1e9, deliveryDate: "2030-06-03" });
    await adminSetDeliveryStatus(row.publicId, "not_delivered", 1n);
    expect(deleteOrder).toHaveBeenCalledWith(row.publicId);
  });

  it("refuses a delivery whose tiffins already moved onto another day", async () => {
    const order = await makeOrder();
    const source = await seedDelivery(order.id, { deliveryDate: "2030-06-04" });
    const target = await seedDelivery(order.id, { deliveryDate: "2030-06-05", cutoffAt: Date.now() + 1e9 });
    await db.update(deliveries).set({ mergedIntoDeliveryId: target.id }).where(eq(deliveries.id, source.id));
    await expect(adminSetDeliveryStatus(source.publicId, "delivered", 1n)).rejects.toBeInstanceOf(ValidationError);
  });
});
