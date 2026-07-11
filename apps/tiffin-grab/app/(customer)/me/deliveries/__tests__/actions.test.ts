import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { NotFoundError, ValidationError, nextWeekday } from "@realm/commons";

const session: { user: { id: string; role: string } | null } = { user: null };
vi.mock("@/lib/auth/session", () => ({ getSession: async () => (session.user ? session : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { db } = await import("@/db/client");
const { deliveries, ledgerEntries, orderActivities, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("@/lib/services/orders.service");
const {
  skipMyDelivery,
  unskipMyDelivery,
  setMyDeliveryAddress,
  clearMyDeliveryAddress,
  pauseMySubscription,
  resumeMySubscription,
} = await import("../actions");

const FROM = "2000-01-01";
const UNTIL = "2100-12-31";

const PHONE_A = "+16475550401";
const PHONE_B = "+16475550402";

async function reset() {
  await db.delete(deliveries);
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

// M5V is a seeded Toronto zone -> lands "active" with materialized rows.
async function makeOrder(phone: string, fullName: string) {
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
    contact: { fullName, phone, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  const [o] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  return o;
}

async function firstDeliveryOf(order: { id: bigint }) {
  const [row] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id));
  return row;
}

function actAs(publicId: string) {
  session.user = { id: publicId, role: "user" };
}

const ADDR = { fullName: "New Name", addressLine: "2 Ave", city: "Toronto", postalCode: "M5V 2T6" };

describe("(customer)/me/deliveries actions (integration)", () => {
  beforeEach(async () => {
    await reset();
    session.user = null;
  });
  afterAll(reset);

  it("rejects skipping another user's delivery with NotFoundError, no state change", async () => {
    const aOrder = await makeOrder(PHONE_A, "User A");
    const bOrder = await makeOrder(PHONE_B, "User B");
    const [userA] = await db.select({ id: users.id, publicId: users.publicId }).from(orders)
      .innerJoin(users, eq(orders.userId, users.id)).where(eq(orders.id, aOrder.id));
    const bDelivery = await firstDeliveryOf(bOrder);

    actAs(userA.publicId);
    await expect(skipMyDelivery(bDelivery.publicId)).rejects.toBeInstanceOf(NotFoundError);
    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, bDelivery.id));
    expect(row.status).toBe("scheduled"); // untouched — guard ran before the mutation
  });

  it("lets the owner skip their own delivery", async () => {
    const aOrder = await makeOrder(PHONE_A, "User A");
    const [userA] = await db.select({ id: users.id, publicId: users.publicId }).from(orders)
      .innerJoin(users, eq(orders.userId, users.id)).where(eq(orders.id, aOrder.id));
    const aDelivery = await firstDeliveryOf(aOrder);

    actAs(userA.publicId);
    await skipMyDelivery(aDelivery.publicId);
    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, aDelivery.id));
    expect(row.status).toBe("skipped");
  });

  it("rejects unskipping another user's delivery", async () => {
    const aOrder = await makeOrder(PHONE_A, "User A");
    const bOrder = await makeOrder(PHONE_B, "User B");
    const [userA] = await db.select({ id: users.id, publicId: users.publicId }).from(orders)
      .innerJoin(users, eq(orders.userId, users.id)).where(eq(orders.id, aOrder.id));
    const bDelivery = await firstDeliveryOf(bOrder);

    actAs(userA.publicId);
    await expect(unskipMyDelivery(bDelivery.publicId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects re-addressing another user's delivery", async () => {
    const aOrder = await makeOrder(PHONE_A, "User A");
    const bOrder = await makeOrder(PHONE_B, "User B");
    const [userA] = await db.select({ id: users.id, publicId: users.publicId }).from(orders)
      .innerJoin(users, eq(orders.userId, users.id)).where(eq(orders.id, aOrder.id));
    const bDelivery = await firstDeliveryOf(bOrder);

    actAs(userA.publicId);
    await expect(setMyDeliveryAddress(bDelivery.publicId, ADDR)).rejects.toBeInstanceOf(NotFoundError);
    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, bDelivery.id));
    expect(row.fullName).not.toBe(ADDR.fullName);
  });

  it("rejects clearing another user's delivery address", async () => {
    const aOrder = await makeOrder(PHONE_A, "User A");
    const bOrder = await makeOrder(PHONE_B, "User B");
    const [userA] = await db.select({ id: users.id, publicId: users.publicId }).from(orders)
      .innerJoin(users, eq(orders.userId, users.id)).where(eq(orders.id, aOrder.id));
    const bDelivery = await firstDeliveryOf(bOrder);

    actAs(userA.publicId);
    await expect(clearMyDeliveryAddress(bDelivery.publicId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects pausing another user's subscription, no state change", async () => {
    const aOrder = await makeOrder(PHONE_A, "User A");
    const bOrder = await makeOrder(PHONE_B, "User B");
    const [userA] = await db.select({ id: users.id, publicId: users.publicId }).from(orders)
      .innerJoin(users, eq(orders.userId, users.id)).where(eq(orders.id, aOrder.id));

    actAs(userA.publicId);
    await expect(
      pauseMySubscription(bOrder.publicId, { from: FROM, until: UNTIL }),
    ).rejects.toBeInstanceOf(NotFoundError);
    const [row] = await db.select().from(orders).where(eq(orders.id, bOrder.id));
    expect(row.status).toBe("active");
  });

  it("rejects resuming another user's subscription", async () => {
    const aOrder = await makeOrder(PHONE_A, "User A");
    const bOrder = await makeOrder(PHONE_B, "User B");
    const [userA] = await db.select({ id: users.id, publicId: users.publicId }).from(orders)
      .innerJoin(users, eq(orders.userId, users.id)).where(eq(orders.id, aOrder.id));

    actAs(userA.publicId);
    await expect(resumeMySubscription(bOrder.publicId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("surfaces the cutoff gate on a past delivery", async () => {
    const aOrder = await makeOrder(PHONE_A, "User A");
    const [userA] = await db.select({ id: users.id, publicId: users.publicId }).from(orders)
      .innerJoin(users, eq(orders.userId, users.id)).where(eq(orders.id, aOrder.id));
    const aPastDelivery = await firstDeliveryOf(aOrder);
    await db.update(deliveries).set({ cutoffAt: Date.now() - 1000 }).where(eq(deliveries.id, aPastDelivery.id));

    actAs(userA.publicId);
    await expect(skipMyDelivery(aPastDelivery.publicId)).rejects.toBeInstanceOf(ValidationError);
  });
});
