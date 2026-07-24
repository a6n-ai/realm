import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq, ne } from "drizzle-orm";
import { nextWeekday } from "@realm/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, ledgerEntries, orderActivities, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../orders.service");
const { resumeOrder } = await import("../deliveries.service");

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
    contact: { fullName: "A B", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  const [o] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  return o;
}

// A whole week paused, all with future cutoffs (simulating an active vacation).
async function pausedWeek(o: { id: bigint }) {
  await db.delete(deliveries).where(eq(deliveries.orderId, o.id));
  const dates = ["2030-01-07", "2030-01-08", "2030-01-09", "2030-01-10", "2030-01-11"];
  await db.insert(deliveries).values(dates.map((deliveryDate) => ({
    orderId: o.id, deliveryDate, status: "paused" as const, cutoffAt: Date.now() + 1e9,
  })));
}

async function rowsFor(o: { id: bigint }) {
  return db.select().from(deliveries).where(eq(deliveries.orderId, o.id)).orderBy(asc(deliveries.deliveryDate));
}

describe("resumeOrder with fromDate (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("revives paused days on/after fromDate and pools the earlier ones", async () => {
    const o = await makeOrder();
    await pausedWeek(o);

    const revived = await resumeOrder(o.publicId, "2030-01-09");
    expect(revived).toBe(3); // 09, 10, 11

    const rows = await rowsFor(o);
    const byDate = Object.fromEntries(rows.map((r) => [r.deliveryDate, r]));
    expect(byDate["2030-01-07"].status).toBe("paused");
    expect(byDate["2030-01-07"].pooledAt).not.toBeNull();
    expect(byDate["2030-01-08"].pooledAt).not.toBeNull();
    expect(byDate["2030-01-09"].status).toBe("scheduled");
    expect(byDate["2030-01-09"].pooledAt).toBeNull();
    expect(byDate["2030-01-11"].status).toBe("scheduled");

    const [order] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(order.pooledTiffinCount).toBe(2); // 07 + 08, persons = 1
  });

  it("plain resume (no fromDate) revives all future paused days and pools none", async () => {
    const o = await makeOrder();
    await pausedWeek(o);

    const revived = await resumeOrder(o.publicId);
    expect(revived).toBe(5);

    const rows = await rowsFor(o);
    expect(rows.every((r) => r.status === "scheduled")).toBe(true);
    const [order] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(order.pooledTiffinCount).toBe(0);
  });
});
