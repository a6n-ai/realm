// A meal size made only on some days (e.g. non-veg only while Tue/Thu are veg-only): new orders, moves and the
// day set every make-up / redelivery / holiday extra walks must stay on those days.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { nextWeekday, parseIsoDateUtc, weekdayKey } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, ledgerEntries, mealSizes, orders, payments, users } = await import("@/db/schema");
const { invalidateCatalogSnapshot, loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../orders.service");
const { orderDeliveryDaySet, rescheduleDelivery } = await import("../deliveries.service");

const createdOrderIds: bigint[] = [];
const createdUserIds: bigint[] = [];
let sizeId: bigint;
let sizePublicId: string;
let planKey: string;
let before: string[] | null;

const contact = () => ({
  email: `u${Math.random().toString(36).slice(2)}@test.invalid`,
  fullName: "A B", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6",
});

async function setAllowed(days: string[] | null) {
  await db.update(mealSizes).set({ allowedDays: days }).where(eq(mealSizes.id, sizeId));
  await invalidateCatalogSnapshot();
}

async function order(frequencyKey: string, eatingDays: string[]) {
  const { publicId } = await createOrder({
    planKey,
    selections: {
      mealSizeId: sizePublicId, frequencyKey, persons: 1, mealSlots: ["lunch"], eatingDays: eatingDays as never,
      includeSaturday: false, includeSunday: false, durationWeeks: 2,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: contact(),
  });
  const [row] = await db.select().from(orders).where(eq(orders.publicId, publicId)).limit(1);
  createdOrderIds.push(row.id);
  if (row.userId) createdUserIds.push(row.userId);
  return row;
}

beforeAll(async () => {
  const snap = await loadCatalogSnapshot();
  const size = snap.mealSizes.find((m) => !m.trial && !m.custom)!;
  sizeId = size.id;
  sizePublicId = size.publicId;
  planKey = size.planKey;
  const [row] = await db.select({ days: mealSizes.allowedDays }).from(mealSizes).where(eq(mealSizes.id, sizeId));
  before = row?.days ?? null;
});
afterEach(async () => {
  await setAllowed(before);
  const orderIds = createdOrderIds.splice(0);
  const userIds = createdUserIds.splice(0);
  if (orderIds.length) {
    await db.delete(ledgerEntries).where(inArray(ledgerEntries.orderId, orderIds));
    await db.delete(payments).where(inArray(payments.orderId, orderIds));
    await db.delete(orders).where(inArray(orders.id, orderIds));
  }
  if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
});
afterAll(async () => { await setAllowed(before); });

describe("meal size allowed days", () => {
  it("createOrder refuses a Mon-Fri frequency and a Tue eating day for a Mon/Wed/Fri size, and takes MWF", async () => {
    await setAllowed(["mon", "wed", "fri"]);
    await expect(order("5_day", ["mon", "wed", "fri"])).rejects.toThrow(/only made on Mon, Wed and Fri/);
    await expect(order("mwf", ["mon", "tue", "wed"])).rejects.toThrow(/only made on Mon, Wed and Fri/);
    const ok = await order("mwf", ["mon", "wed", "fri"]);
    expect(ok.eatingDays).toEqual(["mon", "wed", "fri"]);
  });

  it("an old Mon-Fri order's make-up / redelivery days skip the days the size isn't made on", async () => {
    const old = await order("5_day", ["mon", "tue", "wed", "thu", "fri"]);
    await setAllowed(["mon", "wed", "fri"]);
    expect([...(await orderDeliveryDaySet(db as never, old))].sort()).toEqual(["fri", "mon", "wed"]);
  });

  it("a move onto a day the size isn't made on is refused", async () => {
    const old = await order("5_day", ["mon", "tue", "wed", "thu", "fri"]);
    await setAllowed(["mon", "wed", "fri"]);
    const rows = await db.select().from(deliveries).where(eq(deliveries.orderId, old.id));
    const from = rows.find((r) => weekdayKey(parseIsoDateUtc(r.deliveryDate)) === "mon")!;
    const tue = parseIsoDateUtc(from.deliveryDate);
    tue.setUTCDate(tue.getUTCDate() + 8);
    await expect(rescheduleDelivery(from.publicId, tue.toISOString().slice(0, 10), null)).rejects.toThrow(/only made on/);
  });
});
