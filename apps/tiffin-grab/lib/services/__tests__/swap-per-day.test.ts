import { afterEach, describe, expect, it, vi } from "vitest";
import { asc, eq, inArray } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, deliveryCategorySwaps, ledgerEntries, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../orders.service");
const { applyDeliverySwap, removeDeliverySwap } = await import("../category-swaps.service");
const { myCalendar } = await import("../customer-deliveries.service");

const createdOrderIds: bigint[] = [];
const createdUserIds: bigint[] = [];

afterEach(async () => {
  const orderIds = createdOrderIds.splice(0);
  const userIds = createdUserIds.splice(0);
  if (orderIds.length) {
    await db.delete(ledgerEntries).where(inArray(ledgerEntries.orderId, orderIds));
    await db.delete(payments).where(inArray(payments.orderId, orderIds));
    await db.delete(orders).where(inArray(orders.id, orderIds));
  }
  if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
});

async function setup() {
  const snap = await loadCatalogSnapshot();
  const size = snap.mealSizes.find((s) => {
    const cats = new Set(s.items.map((i) => i.category));
    return cats.has("rice") && cats.has("roti");
  })!;
  const planKey = snap.plans.find((p) => p.id === size.planId)!.key;
  const { publicId } = await createOrder({
    planKey,
    selections: {
      mealSizeId: size.publicId, frequencyKey: "5_day" as const, persons: 1, mealSlots: ["lunch"],
      includeSaturday: false, includeSunday: false, durationWeeks: 1,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: {
      email: `u${Math.random().toString(36).slice(2)}@test.invalid`,
      fullName: "A B", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6",
    },
  });
  const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId)).limit(1);
  createdOrderIds.push(order.id);
  if (order.userId) createdUserIds.push(order.userId);
  const [trip] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id)).orderBy(asc(deliveries.deliveryDate)).limit(1);
  const d = (n: number) => new Date(Date.parse(`${trip.deliveryDate}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
  const covers = [d(0), d(1), d(2)];
  await db.update(deliveries).set({ coversDates: covers }).where(eq(deliveries.id, trip.id));
  return { order, trip, covers, publicId };
}

const swapsOf = (id: bigint) => db.select().from(deliveryCategorySwaps).where(eq(deliveryCategorySwaps.deliveryId, id));

describe("per-eating-day swaps", () => {
  it("a swap on a carried day only affects that day; own date stores NULL", async () => {
    const { trip, covers } = await setup();
    await applyDeliverySwap(trip.publicId, "rice", "roti", 1, null, covers[1]);
    await applyDeliverySwap(trip.publicId, "rice", "roti", 1, null, covers[0]);
    const rows = await swapsOf(trip.id);
    expect(rows.map((r) => r.forDate).sort()).toEqual([covers[1], null].sort());
  });

  it("stack bound is per day: the same swap is allowed once on each day but not twice on one", async () => {
    const { trip, covers } = await setup();
    await applyDeliverySwap(trip.publicId, "rice", "roti", 1, null, covers[1]);
    await applyDeliverySwap(trip.publicId, "rice", "roti", 1, null, covers[2]);
    await expect(applyDeliverySwap(trip.publicId, "rice", "roti", 1, null, covers[1])).rejects.toThrow();
  });

  it("rejects a day the trip does not cover", async () => {
    const { trip, covers } = await setup();
    const outside = new Date(Date.parse(`${covers[2]}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);
    await expect(applyDeliverySwap(trip.publicId, "rice", "roti", 1, null, outside)).rejects.toThrow(/cover/);
  });

  it("locks on the trip's cutoff", async () => {
    const { trip, covers } = await setup();
    await db.update(deliveries).set({ cutoffAt: Date.now() - 1000 }).where(eq(deliveries.id, trip.id));
    await expect(applyDeliverySwap(trip.publicId, "rice", "roti", 1, null, covers[1])).rejects.toThrow(/locked/);
  });

  it("legacy NULL rows count as the trip's own date and remove works with forDate", async () => {
    const { trip, covers } = await setup();
    await db.insert(deliveryCategorySwaps).values({ deliveryId: trip.id, fromCategory: "rice", toCategory: "roti", qtyFrom: 1, qtyTo: 4 });
    await expect(applyDeliverySwap(trip.publicId, "rice", "roti", 1, null)).rejects.toThrow();
    await applyDeliverySwap(trip.publicId, "rice", "roti", 1, null, covers[1]);
    const sat = (await swapsOf(trip.id)).find((r) => r.forDate === covers[1])!;
    await expect(removeDeliverySwap(trip.publicId, sat.publicId, null, covers[0])).rejects.toThrow();
    await removeDeliverySwap(trip.publicId, sat.publicId, null, covers[1]);
    expect(await swapsOf(trip.id)).toHaveLength(1);
  });

  it("myCalendar exposes per-day applied swaps and pairs; non-owner rejected", async () => {
    const { order, trip, covers, publicId } = await setup();
    await applyDeliverySwap(trip.publicId, "rice", "roti", 1, null, covers[1]);
    const range = { from: covers[0], until: covers[2] };
    const days = await myCalendar(order.userId!, publicId, range);
    const day = days.find((x) => x.date === trip.deliveryDate)!;
    expect(day.eatingDays!.map((e) => e.date)).toEqual(covers);
    expect(day.eatingDays![0].appliedSwaps).toEqual([]);
    expect(day.eatingDays![1].appliedSwaps).toHaveLength(1);
    expect(day.eatingDays![1].appliedSwaps[0]).toMatchObject({ fromCategory: "rice", toCategory: "roti", qtyFrom: 1, qtyTo: 4 });
    expect(day.eatingDays![0].swapPairs.some((p) => p.fromCategory === "rice" && p.toCategory === "roti")).toBe(true);
    expect(day.swapAllowance).toBeNull();
    await expect(myCalendar(order.userId! + 999999n, publicId, range)).rejects.toThrow();
  });
});
