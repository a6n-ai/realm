import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { nextWeekday } from "@realm/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, ledgerEntries, orderActivities, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../orders.service");
const { nextDeliveryByOrder } = await import("../customer-deliveries.service");

const FROM = "2000-01-01";

async function reset() {
  await db.delete(deliveries);
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

// M5V is a seeded Toronto zone -> lands "active" with materialized rows.
async function makeOrder(phone: string) {
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
    contact: { fullName: "A B", phone, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  const [o] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  return o;
}

async function userIdByPhone(phone: string) {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
  return row.id;
}

const PHONE_A = "+16475550401";

describe("nextDeliveryByOrder (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("keeps one entry per order: the earliest scheduled row, skipping skipped rows", async () => {
    const orderOne = await makeOrder(PHONE_A);
    const orderTwo = await makeOrder(PHONE_A); // same phone -> same user, second active order
    const userA = await userIdByPhone(PHONE_A);

    // orderOne: an earlier row is skipped, so its next delivery should be the later scheduled one.
    const [earliestOne] = await db.select().from(deliveries).where(eq(deliveries.orderId, orderOne.id)).orderBy(deliveries.deliveryDate);
    await db.update(deliveries).set({ status: "skipped" }).where(eq(deliveries.id, earliestOne.id));

    const rowsOne = await db.select().from(deliveries).where(eq(deliveries.orderId, orderOne.id)).orderBy(deliveries.deliveryDate);
    const expectedOneDate = rowsOne.find((r) => r.status === "scheduled")!.deliveryDate;

    const rowsTwo = await db.select().from(deliveries).where(eq(deliveries.orderId, orderTwo.id)).orderBy(deliveries.deliveryDate);
    const expectedTwoDate = rowsTwo[0].deliveryDate;

    const map = await nextDeliveryByOrder(userA, FROM);

    expect(map.size).toBe(2);
    expect(map.get(orderOne.publicId)?.deliveryDate).toBe(expectedOneDate);
    expect(map.get(orderOne.publicId)?.status).toBe("scheduled");
    expect(map.get(orderTwo.publicId)?.deliveryDate).toBe(expectedTwoDate);
  });
});
