import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, ledgerEntries, orderActivities, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../orders.service");

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
// startOffsetWeeks staggers non-overlapping delivery windows for a customer
// that needs several live subscriptions at once (7*n days keeps the same weekday).
async function makeOrder(phone: string, fullName: string, startOffsetWeeks = 0) {
  const snap = await loadCatalogSnapshot();
  const startDate = nextWeekday(new Date());
  startDate.setUTCDate(startDate.getUTCDate() + startOffsetWeeks * 7);
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
      startDate: startDate.toISOString().slice(0, 10),
    },
    contact: { email: `u${Math.random().toString(36).slice(2)}@test.invalid`,  fullName, phone, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  const [o] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  return o;
}

async function userIdOf(phone: string) {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
  return row.id;
}

describe("mySubscriptionsSummary (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("returns all of a user's subscriptions across every status, newest first, scoped to that user", async () => {
    const { mySubscriptionsSummary } = await import("@/lib/services/customer-deliveries.service");

    const aOrderOne = await makeOrder(PHONE_A, "User A");
    const aOrderTwo = await makeOrder(PHONE_A, "User A", 1);
    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, aOrderTwo.id));
    await makeOrder(PHONE_B, "User B");

    const userAId = await userIdOf(PHONE_A);
    const subs = await mySubscriptionsSummary(userAId);

    expect(subs.length).toBe(2);
    expect(subs.map((s) => s.status).sort()).toEqual(["cancelled", "upcoming"]);
    expect(subs.every((s) => s.planName && s.mealSizeName && s.startDate)).toBe(true);
    expect(subs[0].createdAt).toBeGreaterThanOrEqual(subs[1].createdAt);
    expect(subs.map((s) => s.publicId).sort()).toEqual([aOrderOne.publicId, aOrderTwo.publicId].sort());
  });
});
