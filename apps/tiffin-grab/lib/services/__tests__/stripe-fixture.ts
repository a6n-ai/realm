import { eq, inArray, ne } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";
import { db } from "@/db/client";
import { couponRedemptions, deliveries, ledgerEntries, notificationOutbox, orderActivities, orders, payments, stripeEvents, users, walletLedger } from "@/db/schema";
import { createOrder } from "../orders.service";
import { setPaymentConfig } from "../app-settings.service";
import { sharedCache } from "@/lib/cache";
import { loadCatalogSnapshot } from "@/lib/catalog/load";

export async function baseInput(over: { couponCode?: string; paymentMethodId?: string; phone?: string } = {}) {
  const snap = await loadCatalogSnapshot();
  return {
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
    contact: {
      email: `u${Math.random().toString(36).slice(2)}@test.invalid`,
      fullName: "Pay Test",
      phone: over.phone ?? "+16475550999",
      addressLine: "1 St",
      city: "Toronto",
      postalCode: "M5V 2T6",
    },
    couponCode: over.couponCode ?? null,
    paymentMethodId: over.paymentMethodId ?? null,
  };
}

export async function reset() {
  await db.delete(stripeEvents);
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
  await setPaymentConfig({
    methods: [{ id: "etransfer", kind: "manual", enabled: true, label: "e-Transfer", payeeHandle: "p@x.ca", taxes: [] }],
  });
  await sharedCache("app-settings").evictAll();
}

/** An order with one stripe payment row; amount overrides make cents math explicit. */
export let OWNER = "";

export async function makeStripePayment(o: {
  amount: string; surcharge?: string; piId: string | null; paid?: boolean;
  postalCode?: string; taxCalc?: { id: string; expiresAt: number };
}) {
  const { publicId } = await createOrder(await baseInput({ paymentMethodId: "etransfer" }));
  const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  const [owner] = await db.select({ publicId: users.publicId }).from(users).where(eq(users.id, order!.userId!));
  OWNER = owner!.publicId;
  if (o.postalCode) await db.update(orders).set({ postalCode: o.postalCode }).where(eq(orders.id, order!.id));
  if (o.taxCalc) {
    const snap = order!.pricingSnapshot as Record<string, unknown>;
    await db.update(orders).set({
      pricingSnapshot: { ...snap, taxTotal: 13, tax: { source: "stripe", calculationId: o.taxCalc.id, expiresAt: o.taxCalc.expiresAt } },
    }).where(eq(orders.id, order!.id));
  }
  const [pay] = await db
    .update(payments)
    .set({ method: "stripe", amount: o.amount, surchargeAmount: o.surcharge ?? "0", providerRef: o.piId, status: o.paid ? "paid" : "awaiting_payment", ...(o.taxCalc ? { taxCalculationId: o.taxCalc.id, taxSource: "stripe" } : {}) })
    .where(eq(payments.orderId, order!.id))
    .returning();
  return pay!;
}

/** Leaves the shared test DB with no payment rails, as other suites expect. */
export async function cleanup() {
  await reset();
  await setPaymentConfig({ methods: [] });
  await sharedCache("app-settings").evictAll();
}
