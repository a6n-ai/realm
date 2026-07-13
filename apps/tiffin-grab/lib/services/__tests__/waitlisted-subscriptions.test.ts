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
const { myWaitlistedSubscriptions } = await import("@/lib/services/customer-deliveries.service");

async function reset() {
  await db.delete(deliveries); await db.delete(ledgerEntries); await db.delete(orderActivities);
  await db.delete(payments); await db.delete(orders); await db.delete(users).where(ne(users.isSystem, true));
}

// Postal M5V 2T6 is a seeded Toronto zone -> order lands "active" with materialized deliveries.
async function makeOrder(phone: string, fullName: string) {
  const snap = await loadCatalogSnapshot();
  const { publicId } = await createOrder({
    planKey: snap.plans[0].key,
    selections: { mealSizeId: snap.mealSizes[0].publicId, frequencyKey: "5_day", persons: 1, mealSlots: ["lunch"],
      includeSaturday: false, includeSunday: false, durationWeeks: 1, startDate: nextWeekday(new Date()).toISOString().slice(0, 10) },
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

// Force an order to waitlisted (deterministic — avoids depending on which postals are out-of-zone).
async function makeWaitlisted(phone: string, fullName: string) {
  const o = await makeOrder(phone, fullName);
  await db.delete(deliveries).where(eq(deliveries.orderId, o.id)); // waitlisted orders have none
  await db.update(orders).set({ status: "waitlisted" }).where(eq(orders.id, o.id));
  return o;
}

describe("myWaitlistedSubscriptions (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("returns waitlisted orders with summary, excludes active", async () => {
    const wl = await makeWaitlisted("+16475550501", "WL User");
    // Add an ACTIVE order for the SAME user so we prove filtering, not just emptiness.
    await makeOrder("+16475550501", "WL User"); // same phone -> same provisioned user
    const { id: userId } = await userIdOf(wl);

    const rows = await myWaitlistedSubscriptions(userId);
    expect(rows.map((r) => r.status)).toEqual(["waitlisted"]);
    expect(rows[0]).toMatchObject({
      planName: expect.any(String), mealSizeName: expect.any(String),
      daysPerWeek: expect.any(Number), postalCode: expect.any(String),
    });
  });
});
