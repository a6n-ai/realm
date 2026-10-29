import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, like, ne, sql } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { orders, payments, orderActivities, ledgerEntries, users, deliveries, notificationOutbox } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { nextWeekday } = await import("@foundry/commons");
const { createOrder } = await import("@/lib/services/orders.service");
const { sendRenewalReminders, sendRenewalReminderNow } = await import("../renewal-reminder");

async function reset() {
  await db.delete(notificationOutbox).where(like(notificationOutbox.dedupeKey, "renewal:%"));
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

const input = (mealSizeId: string, planKey: string, phone: string) => ({
  planKey,
  selections: {
    mealSizeId,
    frequencyKey: "5_day" as const,
    persons: 1,
    mealSlots: ["lunch"],
    includeSaturday: false,
    includeSunday: false,
    durationWeeks: 1,
    startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
  },
  contact: { email: `r${Math.random().toString(36).slice(2)}@test.invalid`, fullName: "Rita Renew", phone, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
});

const minusDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
// Noon Toronto on the given day, so the app-timezone "today" is that date.
const noonOn = (iso: string) => Date.parse(`${iso}T17:00:00Z`);
const reminders = () => db.select({ key: notificationOutbox.dedupeKey }).from(notificationOutbox).where(like(notificationOutbox.dedupeKey, "renewal:%"));

describe("renewal reminders (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("reminds 5 days before the last tiffin once, and skips a customer who already renewed", async () => {
    const snap = await loadCatalogSnapshot();
    const o = await createOrder(input(snap.mealSizes[0].publicId, snap.plans[0].key, "+16475550333"));
    await db.update(orders).set({ status: "active" }).where(eq(orders.publicId, o.publicId));
    const [{ last }] = await db.select({ last: sql<string>`max(${deliveries.deliveryDate})` }).from(deliveries)
      .innerJoin(orders, eq(orders.id, deliveries.orderId)).where(eq(orders.publicId, o.publicId));

    expect(await sendRenewalReminders(noonOn(minusDays(last, 4)))).toEqual({ days5: 0, days1: 0 });
    expect(await sendRenewalReminders(noonOn(minusDays(last, 5)))).toEqual({ days5: 1, days1: 0 });
    // Rerun the same day: the dedupe key keeps it to one email.
    await sendRenewalReminders(noonOn(minusDays(last, 5)));
    // The engine suffixes the channel onto the dedupe key.
    expect(await reminders()).toEqual([{ key: `renewal:${o.publicId}:${last}:5:email` }]);

    // An unpaid later plan counts as renewed: no last-day reminder.
    const next = await createOrder(input(snap.mealSizes[0].publicId, snap.plans[0].key, "+16475550444"));
    const [first] = await db.select({ userId: orders.userId }).from(orders).where(eq(orders.publicId, o.publicId));
    await db.update(orders).set({ userId: first.userId, startDate: "2099-01-05", status: "pending" }).where(eq(orders.publicId, next.publicId));
    expect(await sendRenewalReminders(noonOn(minusDays(last, 1)))).toEqual({ days5: 0, days1: 0 });
    // So does a waitlisted one.
    await db.update(orders).set({ status: "waitlisted" }).where(eq(orders.publicId, next.publicId));
    expect(await sendRenewalReminders(noonOn(minusDays(last, 1)))).toEqual({ days5: 0, days1: 0 });
    // A cancelled one does not.
    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.publicId, next.publicId));
    expect(await sendRenewalReminders(noonOn(minusDays(last, 1)))).toEqual({ days5: 0, days1: 1 });
  });

  it("never reminds a trial", async () => {
    const snap = await loadCatalogSnapshot();
    const o = await createOrder(input(snap.mealSizes[0].publicId, snap.plans[0].key, "+16475550555"));
    await db.update(orders).set({ status: "active", trialLength: 1 }).where(and(eq(orders.publicId, o.publicId)));
    const [{ last }] = await db.select({ last: sql<string>`max(${deliveries.deliveryDate})` }).from(deliveries)
      .innerJoin(orders, eq(orders.id, deliveries.orderId)).where(eq(orders.publicId, o.publicId));
    expect(await sendRenewalReminders(noonOn(minusDays(last, 5)))).toEqual({ days5: 0, days1: 0 });
  });

  it("staff send now: once a day per plan, only while the plan runs with nothing booked after it", async () => {
    const snap = await loadCatalogSnapshot();
    const o = await createOrder(input(snap.mealSizes[0].publicId, snap.plans[0].key, "+16475550666"));
    await db.update(orders).set({ status: "active" }).where(eq(orders.publicId, o.publicId));
    const [{ last }] = await db.select({ last: sql<string>`max(${deliveries.deliveryDate})` }).from(deliveries)
      .innerJoin(orders, eq(orders.id, deliveries.orderId)).where(eq(orders.publicId, o.publicId));
    const day = noonOn(minusDays(last, 3));

    expect(await sendRenewalReminderNow(o.publicId, day)).toBe("sent");
    expect(await sendRenewalReminderNow(o.publicId, day)).toBe("already-sent");
    expect((await reminders()).map((r) => r.key)).toEqual([`renewal:${o.publicId}:${last}:staff-${minusDays(last, 3)}:email`]);

    // A later plan means nothing to remind.
    const next = await createOrder(input(snap.mealSizes[0].publicId, snap.plans[0].key, "+16475550777"));
    const [first] = await db.select({ userId: orders.userId }).from(orders).where(eq(orders.publicId, o.publicId));
    await db.update(orders).set({ userId: first.userId, startDate: "2099-01-05", status: "pending" }).where(eq(orders.publicId, next.publicId));
    await expect(sendRenewalReminderNow(o.publicId, noonOn(minusDays(last, 2)))).rejects.toThrow(/no next plan/);
  });
});
