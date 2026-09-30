import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, ne } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";

// Real better-auth + DB: the reminder's magic link must sign the customer in
// and land on Finances → Bills. Only the Next request scope is stubbed.
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => {}, delete: () => {} }),
}));

const { db } = await import("@/db/client");
const { account, deliveries, ledgerEntries, notificationOutbox, orderActivities, orders, payments, session, users, walletLedger } =
  await import("@/db/schema");
const { auth } = await import("@/lib/auth");
const { createOrder, verifyPayment } = await import("../orders.service");
const { sendPaymentReminder } = await import("../payment-reminder");
const { setPaymentConfig } = await import("../app-settings.service");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { sharedCache } = await import("@/lib/cache");

const customers = () => db.select({ id: users.id }).from(users).where(ne(users.isSystem, true));

async function reset() {
  await db.delete(walletLedger);
  await db.delete(ledgerEntries);
  await db.delete(deliveries);
  await db.delete(payments);
  await db.delete(orderActivities);
  await db.delete(orders);
  await db.delete(notificationOutbox).where(inArray(notificationOutbox.recipientId, customers()));
  await db.delete(notificationOutbox).where(eq(notificationOutbox.event, "payment_reminder"));
  await db.delete(session).where(inArray(session.userId, customers()));
  await db.delete(account).where(inArray(account.userId, customers()));
  await db.delete(users).where(ne(users.isSystem, true));
  await setPaymentConfig({ methods: [] });
  await sharedCache("app-settings").evictAll();
}

async function unpaidOrder() {
  await setPaymentConfig({
    methods: [{ id: "etransfer", kind: "manual", enabled: true, label: "Interac e-Transfer", payeeHandle: "pay@test.ca", taxes: [] }],
  });
  await sharedCache("app-settings").evictAll();
  const snap = await loadCatalogSnapshot();
  const email = `remind${Math.random().toString(36).slice(2)}@test.invalid`;
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
    contact: { email, fullName: "Remind Me", phone: "+16475550777", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
    couponCode: null,
    paymentMethodId: "etransfer",
  });
  const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  const [pay] = await db.select().from(payments).where(eq(payments.orderId, order!.id));
  return { order: order!, pay: pay!, email };
}

describe("sendPaymentReminder", () => {
  beforeEach(reset);
  afterAll(reset);

  it("emails a sign-in link that lands on Finances → Bills and logs the reminder", async () => {
    const { order, pay, email } = await unpaidOrder();
    expect(pay.status).toBe("awaiting_payment");

    await sendPaymentReminder(order.publicId, pay.publicId, null);

    const [row] = await db
      .select({ payload: notificationOutbox.payload })
      .from(notificationOutbox)
      .where(and(eq(notificationOutbox.event, "payment_reminder"), eq(notificationOutbox.recipientEmail, email)));
    const vars = (row!.payload as { vars: { payment: { url: string; orderCode: string; customerName: string } } }).vars.payment;
    expect(vars.orderCode).toBe(order.deploymentId);
    expect(vars.customerName).toBe("Remind Me");

    const res = await auth.handler(new Request(vars.url));
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname + loc.search).toBe("/me/wallet?tab=bills");
    expect(res.headers.getSetCookie().some((c) => c.includes("session_token"))).toBe(true);

    const notes = await db
      .select({ note: orderActivities.note })
      .from(orderActivities)
      .where(and(eq(orderActivities.orderId, order.id), eq(orderActivities.type, "note")));
    expect(notes.map((n) => n.note)).toContain(`Payment reminder emailed to ${email}`);
  });

  it("refuses a payment that is already paid", async () => {
    const { order, pay } = await unpaidOrder();
    await verifyPayment(pay.publicId);
    await expect(sendPaymentReminder(order.publicId, pay.publicId, null)).rejects.toThrow(
      "Only an unpaid or rejected payment can be reminded",
    );
  });
});
