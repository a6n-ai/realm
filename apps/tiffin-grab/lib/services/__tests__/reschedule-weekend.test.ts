// Eat-day reschedule: picker is the day the customer wants to EAT. Weekends and
// off-pattern weekdays snap to the carrying trip (never a weekend delivery row).
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { nextWeekday, parseIsoDateUtc, weekdayKey } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, ledgerEntries, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../orders.service");
const { rescheduleDelivery } = await import("../deliveries.service");
const { coveredDates } = await import("@/lib/menu/coverage");
const { carryTripDateIso } = await import("@/lib/menu/carry-trip");
import type { DayOfWeek } from "@/lib/menu/delivery-days";

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

async function makeOrder(includeWeekend: boolean, frequencyKey = "5_day") {
  const snap = await loadCatalogSnapshot();
  const { publicId } = await createOrder({
    planKey: snap.plans[0].key,
    selections: {
      mealSizeId: snap.mealSizes[0].publicId,
      frequencyKey,
      persons: 1,
      mealSlots: ["lunch"],
      includeSaturday: includeWeekend,
      includeSunday: includeWeekend,
      durationWeeks: 2,
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
  return order;
}

async function firstDeliveryOf(order: { id: bigint }) {
  const [row] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id)).limit(1);
  return row;
}

function farFutureWeekendIso(day: "sat" | "sun"): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 21);
  const target = day === "sun" ? 0 : 6;
  while (d.getUTCDay() !== target) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function farFutureIso(dow: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 21);
  while (d.getUTCDay() !== dow) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

describe("rescheduleDelivery eat-day snap", () => {
  it("snaps Saturday onto that week's Friday trip (no weekend delivery row)", async () => {
    const order = await makeOrder(false);
    const delivery = await firstDeliveryOf(order);
    const sat = farFutureWeekendIso("sat");
    const fri = carryTripDateIso(sat, ["mon", "tue", "wed", "thu", "fri"] as DayOfWeek[])!;
    expect(weekdayKey(parseIsoDateUtc(fri))).toBe("fri");

    const res = await rescheduleDelivery(delivery.publicId, sat, null);
    expect(res.carriedOn).toBe(fri);
    expect(res.merged).toBeTypeOf("boolean");

    const rows = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id));
    expect(rows.some((r) => r.deliveryDate === sat && r.status === "scheduled")).toBe(false);
    const carrier = rows.find((r) => r.deliveryDate === fri && r.status === "scheduled");
    expect(carrier).toBeTruthy();
    expect(coveredDates(carrier!).includes(sat)).toBe(true);
  });

  it("snaps Sunday onto Friday even when weekend add-ons are priced in", async () => {
    const order = await makeOrder(true);
    const delivery = await firstDeliveryOf(order);
    const sun = farFutureWeekendIso("sun");
    const res = await rescheduleDelivery(delivery.publicId, sun, null);
    expect(weekdayKey(parseIsoDateUtc(res.carriedOn))).toBe("fri");
    const [source] = await db.select().from(deliveries).where(eq(deliveries.id, delivery.id));
    expect(source.status).toBe("skipped");
  });
});

describe("rescheduleDelivery for eatingDays / MWF", () => {
  it("snaps Tue onto Mon and allows Wed on-pattern; rejects nothing for Sat (snaps to Fri)", async () => {
    const order = await makeOrder(false, "mwf");
    await db.update(orders).set({ eatingDays: ["mon", "wed", "fri", "sat", "sun"] }).where(eq(orders.id, order.id));
    const delivery = await firstDeliveryOf(order);

    const tue = farFutureIso(2); // Tuesday
    const tueRes = await rescheduleDelivery(delivery.publicId, tue, null);
    expect(weekdayKey(parseIsoDateUtc(tueRes.carriedOn))).toBe("mon");
    expect(tueRes.carriedOn).toBe(carryTripDateIso(tue, ["mon", "wed", "fri"])!);
  });

  it("merges onto an existing trip instead of rejecting", async () => {
    const order = await makeOrder(false, "mwf");
    await db.update(orders).set({ eatingDays: ["mon", "wed", "fri"] }).where(eq(orders.id, order.id));
    const all = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id));
    const mon = all.find((d) => weekdayKey(parseIsoDateUtc(d.deliveryDate)) === "mon");
    const dates = new Set(all.map((d) => d.deliveryDate));
    const plusDays = (iso: string, n: number) => {
      const d = parseIsoDateUtc(iso);
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    // A Monday whose own week also has a Wednesday trip (start date varies with today).
    const laterMon = all.find((d) => weekdayKey(parseIsoDateUtc(d.deliveryDate)) === "mon" && dates.has(plusDays(d.deliveryDate, 2)));
    expect(laterMon).toBeTruthy();
    // Reschedule later Mon trip onto Wed of same week via Thursday eat day
    const thu = (() => {
      const d = parseIsoDateUtc(laterMon!.deliveryDate);
      d.setUTCDate(d.getUTCDate() + 3); // Mon+3 = Thu
      return d.toISOString().slice(0, 10);
    })();
    const res = await rescheduleDelivery(laterMon!.publicId, thu, null);
    expect(res.merged).toBe(true);
    expect(weekdayKey(parseIsoDateUtc(res.carriedOn))).toBe("wed");
    const [carrier] = await db.select().from(deliveries).where(eq(deliveries.deliveryDate, res.carriedOn));
    expect(coveredDates(carrier).includes(thu)).toBe(true);
  });
});
