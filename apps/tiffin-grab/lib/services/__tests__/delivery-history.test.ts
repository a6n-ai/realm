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
const { myDeliveryHistory } = await import("@/lib/services/customer-deliveries.service");

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

describe("myDeliveryHistory (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("returns past deliveries in [since, before), newest first, excludes future", async () => {
    const order = await makeOrder("+16475550521", "Hist User");
    const { id: userId } = await userIdOf(order);
    // Force one existing delivery into the past.
    const [d] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id));
    await db.update(deliveries).set({ deliveryDate: "2026-07-05" }).where(eq(deliveries.id, d.id));

    const past = await myDeliveryHistory(userId, "2026-06-13", "2026-07-13");
    expect(past.some((r) => r.deliveryDate === "2026-07-05")).toBe(true);
    expect(past.every((r) => r.deliveryDate < "2026-07-13")).toBe(true);
  });
});
