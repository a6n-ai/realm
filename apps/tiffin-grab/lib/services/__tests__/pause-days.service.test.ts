import { beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq, ne } from "drizzle-orm";
import { nextWeekday, ValidationError } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, ledgerEntries, orderActivities, orders, payments, subscriptionPauses, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../orders.service");
const { pauseDays, releasePausedDays, lapseElapsedPauses } = await import("../pause-days.service");
const { getPauseUsage } = await import("../pause-limits.service");

async function reset() {
  await db.delete(subscriptionPauses);
  await db.delete(deliveries);
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

async function activatedOrder() {
  const snap = await loadCatalogSnapshot();
  const { publicId } = await createOrder({
    planKey: snap.plans[0].key,
    selections: {
      mealSizeId: snap.mealSizes[0].publicId, frequencyKey: "5_day", persons: 1, mealSlots: ["lunch"],
      includeSaturday: false, includeSunday: false, durationWeeks: 1,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: { email: `u${Math.random().toString(36).slice(2)}@test.invalid`, fullName: "A B", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  const [o] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  await db.delete(deliveries).where(eq(deliveries.orderId, o.id));
  const dates = ["2030-01-07", "2030-01-08", "2030-01-09", "2030-01-10", "2030-01-11"];
  await db.insert(deliveries).values(dates.map((deliveryDate) => ({
    orderId: o.id, deliveryDate, status: "scheduled" as const, cutoffAt: Date.now() + 1e9,
  })));
  return o;
}

async function rowsFor(id: bigint) {
  return db.select().from(deliveries).where(eq(deliveries.orderId, id)).orderBy(asc(deliveries.deliveryDate));
}

describe("pauseDays / releasePausedDays", () => {
  beforeEach(reset);

  it("pauses one day and a later day while the first is still paused", async () => {
    const o = await activatedOrder();
    await pauseDays(o.publicId, ["2030-01-07"], null);
    await expect(pauseDays(o.publicId, ["2030-01-09"], null)).resolves.toBe(1);
    const rows = await rowsFor(o.id);
    expect(rows.filter((r) => r.status === "paused").map((r) => r.deliveryDate)).toEqual(["2030-01-07", "2030-01-09"]);
    const [order] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(order.status).toBe("active");
    const usage = await getPauseUsage(o.id);
    expect(usage.count).toBe(2);
    expect(usage.daysUsed).toBe(2);
    expect(usage.hasOpenPause).toBe(false);
  });

  it("releases the middle day, then the rest, and refunds only the released days", async () => {
    const o = await activatedOrder();
    await pauseDays(o.publicId, ["2030-01-07", "2030-01-08", "2030-01-09"], null);
    await releasePausedDays(o.publicId, ["2030-01-08"], null);
    let rows = await rowsFor(o.id);
    expect(rows.find((r) => r.deliveryDate === "2030-01-08")!.status).toBe("scheduled");
    expect(rows.find((r) => r.deliveryDate === "2030-01-07")!.status).toBe("paused");
    expect((await getPauseUsage(o.id)).daysUsed).toBe(2);
    await releasePausedDays(o.publicId, "all", null);
    rows = await rowsFor(o.id);
    expect(rows.every((r) => r.status === "scheduled")).toBe(true);
    expect((await getPauseUsage(o.id)).daysUsed).toBe(0);
    expect((await getPauseUsage(o.id)).count).toBe(1);
  });

  it("refuses a day whose cutoff has passed", async () => {
    const o = await activatedOrder();
    await db.update(deliveries).set({ cutoffAt: Date.now() - 1000 }).where(eq(deliveries.deliveryDate, "2030-01-07"));
    await expect(pauseDays(o.publicId, ["2030-01-07"], null)).rejects.toBeInstanceOf(ValidationError);
  });

  it("a paused day past cutoff becomes a hold and is not put back on the schedule", async () => {
    const o = await activatedOrder();
    await pauseDays(o.publicId, ["2030-01-07"], null);
    await db.update(deliveries).set({ cutoffAt: Date.now() - 1000 }).where(eq(deliveries.deliveryDate, "2030-01-07"));
    await lapseElapsedPauses(o.id);
    const [row] = await rowsFor(o.id);
    expect(row.status).toBe("skipped");
    expect(row.routeSyncedAt).toBeNull();
    expect((await getPauseUsage(o.id)).daysUsed).toBe(1);
  });
});
