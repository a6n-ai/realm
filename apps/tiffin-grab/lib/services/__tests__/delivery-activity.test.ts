import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { nextWeekday } from "@realm/commons";

const session: { user: { id: string; role: string } | null } = { user: null };
vi.mock("@/lib/auth/session", () => ({ getSession: async () => (session.user ? session : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { db } = await import("@/db/client");
const { deliveries, ledgerEntries, orderActivities, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("@/lib/services/orders.service");
const { skipMyDelivery, unskipMyDelivery, setMyDeliveryAddress } = await import("@/app/(customer)/me/deliveries/actions");

function actAs(publicId: string) {
  session.user = { id: publicId, role: "user" };
}

async function reset() {
  await db.delete(deliveries);
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

// Postal M5V 2T6 is a seeded Toronto zone -> order lands "active" with materialized deliveries.
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

async function userIdOf(order: { id: bigint }) {
  const [u] = await db.select({ id: users.id, publicId: users.publicId }).from(orders)
    .innerJoin(users, eq(orders.userId, users.id)).where(eq(orders.id, order.id));
  return u; // { id, publicId }
}

describe("delivery activity audit (integration)", () => {
  beforeEach(async () => {
    await reset();
    session.user = null;
  });
  afterAll(reset);

  it("writes a 'skipped' order_activities row with the session actor as createdBy", async () => {
    const order = await makeOrder("+16475550511", "Skip User");
    const { id: userId, publicId: userPublic } = await userIdOf(order);
    const [d] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id));

    actAs(userPublic);
    await skipMyDelivery(d.publicId);

    const acts = await db.select().from(orderActivities).where(eq(orderActivities.deliveryId, d.id));
    expect(acts).toHaveLength(1);
    expect(acts[0]).toMatchObject({ type: "skipped", orderId: order.id, deliveryId: d.id, createdBy: userId });
  });

  it("writes an 'unskipped' order_activities row with the session actor as createdBy", async () => {
    const order = await makeOrder("+16475550512", "Unskip User");
    const { id: userId, publicId: userPublic } = await userIdOf(order);
    const [d] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id));

    actAs(userPublic);
    await skipMyDelivery(d.publicId);
    await unskipMyDelivery(d.publicId);

    const acts = await db.select().from(orderActivities)
      .where(eq(orderActivities.deliveryId, d.id))
      .orderBy(orderActivities.createdAt);
    expect(acts).toHaveLength(2);
    expect(acts[1]).toMatchObject({ type: "unskipped", orderId: order.id, deliveryId: d.id, createdBy: userId });
  });

  it("writes a 'delivery_address_changed' order_activities row with the session actor as createdBy", async () => {
    const order = await makeOrder("+16475550513", "Address User");
    const { id: userId, publicId: userPublic } = await userIdOf(order);
    const [d] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id));

    actAs(userPublic);
    await setMyDeliveryAddress(d.publicId, {
      fullName: "New Name",
      addressLine: "2 Other St",
      city: "Toronto",
      postalCode: "M4C 1A1",
    });

    const acts = await db.select().from(orderActivities).where(eq(orderActivities.deliveryId, d.id));
    expect(acts).toHaveLength(1);
    expect(acts[0]).toMatchObject({
      type: "delivery_address_changed", orderId: order.id, deliveryId: d.id, createdBy: userId,
    });
  });
});
