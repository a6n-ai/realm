import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { desc, eq, inArray, ne } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { couponRedemptions, deliveries, ledgerEntries, notificationOutbox, orderActivities, orders, payments, users, walletLedger } =
  await import("@/db/schema");
const { createOrder, updatePaymentReference } = await import("../orders.service");
const { setPaymentConfig } = await import("../app-settings.service");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { sharedCache } = await import("@/lib/cache");

async function reset() {
  await db.delete(walletLedger);
  await db.delete(ledgerEntries);
  await db.delete(couponRedemptions);
  await db.delete(deliveries);
  await db.delete(payments);
  await db.delete(orderActivities);
  await db.delete(orders);
  await db
    .delete(notificationOutbox)
    .where(inArray(notificationOutbox.recipientId, db.select({ id: users.id }).from(users).where(ne(users.isSystem, true))));
  await db.delete(users).where(ne(users.isSystem, true));
  await setPaymentConfig({ methods: [] });
  await sharedCache("app-settings").evictAll();
}

async function order(phone = "+16475550998") {
  const snap = await loadCatalogSnapshot();
  const { publicId } = await createOrder({
    planKey: snap.plans[0]!.key,
    selections: {
      mealSizeId: snap.mealSizes[0]!.publicId,
      frequencyKey: "5_day" as const,
      persons: 1,
      mealSlots: ["lunch"],
      includeSaturday: false,
      includeSunday: false,
      durationWeeks: 1,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: { email: `u${Math.random().toString(36).slice(2)}@test.invalid`, fullName: "Ref Test", phone, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
    couponCode: null,
    paymentMethodId: null,
  });
  const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.publicId, publicId));
  const [p] = await db.select({ publicId: payments.publicId }).from(payments).where(eq(payments.orderId, o!.id));
  return { orderId: publicId, internalId: o!.id, paymentId: p!.publicId };
}

const ref = async (paymentId: string) => (await db.select({ r: payments.reference }).from(payments).where(eq(payments.publicId, paymentId)))[0]!.r;
const lastNote = async (orderId: bigint) =>
  (await db.select({ type: orderActivities.type, note: orderActivities.note }).from(orderActivities).where(eq(orderActivities.orderId, orderId)).orderBy(desc(orderActivities.id)).limit(1))[0];

describe("updatePaymentReference", () => {
  beforeEach(reset);
  afterAll(reset);

  it("sets, changes and clears the reference, logging each on the order", async () => {
    const o = await order();
    await updatePaymentReference(o.orderId, o.paymentId, "  ABC123 ");
    expect(await ref(o.paymentId)).toBe("ABC123");
    expect(await lastNote(o.internalId)).toEqual({ type: "note", note: `Payment ${o.paymentId} reference set to ABC123` });

    await updatePaymentReference(o.orderId, o.paymentId, "XYZ789");
    expect(await lastNote(o.internalId)).toMatchObject({ note: `Payment ${o.paymentId} reference changed from ABC123 to XYZ789` });

    await updatePaymentReference(o.orderId, o.paymentId, "");
    expect(await ref(o.paymentId)).toBeNull();
    expect(await lastNote(o.internalId)).toMatchObject({ note: `Payment ${o.paymentId} reference cleared (was XYZ789)` });
  });

  it("no-op when unchanged; rejects a payment from another order and overlong values", async () => {
    const a = await order();
    const b = await order("+16475550997");
    await updatePaymentReference(a.orderId, a.paymentId, "SAME");
    const before = await db.select().from(orderActivities).where(eq(orderActivities.orderId, a.internalId));
    await updatePaymentReference(a.orderId, a.paymentId, "SAME");
    expect(await db.select().from(orderActivities).where(eq(orderActivities.orderId, a.internalId))).toHaveLength(before.length);

    await expect(updatePaymentReference(b.orderId, a.paymentId, "HIJACK")).rejects.toThrow("Payment not found");
    await expect(updatePaymentReference(a.orderId, a.paymentId, "x".repeat(121))).rejects.toThrow("under 120");
    expect(await ref(a.paymentId)).toBe("SAME");
  });
});
