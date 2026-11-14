import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, ne } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deleteNonSystemUsers, ensureSystemUser } = await import("@/db/test-helpers");
const { orders, payments, orderActivities, ledgerEntries, users, walletLedger, notificationOutbox, renewals, inquiries, inquiryActivities } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { nextWeekday } = await import("@foundry/commons");
const { createOrder } = await import("../../orders/create-order");
const { getTrackRows, logTrackActivity, setTrackStatus } = await import("../renewal-tracking.service");
const { openRenewal, logReminderSent } = await import("@/lib/inquiries/inquiry-links.service");
const { openRenewalsDue } = await import("@/lib/notifications/renewal-reminder");
const { deliveries } = await import("@/db/schema");
const { addDaysIso } = await import("@foundry/commons/util/dates");

async function reset() {
  await db.delete(renewals);
  await db.delete(inquiryActivities);
  await db.delete(inquiries);
  await db.delete(walletLedger);
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(notificationOutbox).where(inArray(notificationOutbox.recipientId, db.select({ id: users.id }).from(users).where(ne(users.isSystem, true))));
  await deleteNonSystemUsers();
}

let n = 700;
async function plan(email = `m${Math.random().toString(36).slice(2)}@test.invalid`, startOffsetDays = 0) {
  const snap = await loadCatalogSnapshot();
  const o = await createOrder({
    planKey: snap.plans[0].key,
    selections: {
      mealSizeId: snap.mealSizes[0].publicId, frequencyKey: "5_day" as const, persons: 1, mealSlots: ["lunch"],
      includeSaturday: false, includeSunday: false, durationWeeks: 1,
      startDate: nextWeekday(new Date(Date.now() + startOffsetDays * 86_400_000)).toISOString().slice(0, 10),
    },
    contact: { email, fullName: "Mira Mirror", phone: `+16475551${n++}`, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  const [row] = await db.select({ id: orders.id, userId: orders.userId }).from(orders).where(eq(orders.publicId, o.publicId));
  const [inq] = await db.select().from(inquiries).where(eq(inquiries.customerId, row.userId!));
  return { publicId: o.publicId, id: row.id, userId: row.userId!, inquiryId: inq.id, email };
}

const inqRow = async (id: bigint) => (await db.select().from(inquiries).where(eq(inquiries.id, id)))[0];
const actsOf = (inquiryId: bigint, type: typeof inquiryActivities.$inferSelect["type"]) =>
  db.select().from(inquiryActivities).where(and(eq(inquiryActivities.inquiryId, inquiryId), eq(inquiryActivities.type, type)));

describe("renewal tracking mirrors onto the inquiry", () => {
  beforeEach(async () => {
    await reset();
    await ensureSystemUser();
  });
  afterAll(reset);

  it("a staff status on the current order sets the inquiry's renewal columns and a stage_change", async () => {
    const p = await plan();
    await setTrackStatus(p.publicId, { status: "follow_up", nextFollowUpAt: Date.now() + 86_400_000 });
    expect(await db.$count(renewals)).toBe(0);
    const after = await inqRow(p.inquiryId);
    expect(after).toMatchObject({ renewalStatus: "follow_up", renewalStatusSource: "staff" });
    expect(after.renewalStatusSetAt).not.toBeNull();
    expect(after.renewalFollowUpAt).not.toBeNull();
    const [sc] = await actsOf(p.inquiryId, "stage_change");
    expect(sc).toMatchObject({ orderId: p.id });
    expect(sc.details).toMatchObject({ renewalStatusFrom: null, renewalStatusTo: "follow_up" });
  });

  it("a status on an order that is not the current one writes only an activity", async () => {
    const first = await plan();
    const second = await plan(first.email, 21);
    expect((await inqRow(first.inquiryId)).currentOrderId).toBe(second.id);
    await setTrackStatus(first.publicId, { status: "not_renewed", lostReason: "price" });
    expect((await inqRow(first.inquiryId)).renewalStatus).toBeNull();
    const [sc] = await actsOf(first.inquiryId, "stage_change");
    expect(sc).toMatchObject({ orderId: first.id, lostReason: "price" });
  });

  it("a status on an order that is not the current one shows only the auto status on the desk", async () => {
    const first = await plan();
    await plan(first.email, 21);
    await setTrackStatus(first.publicId, { status: "follow_up" });
    expect((await getTrackRows([first.publicId])).get(first.publicId)).toMatchObject({ status: "renewed", source: "auto" });
  });

  it("a call note mirrors as an inquiry activity on that order's round", async () => {
    const p = await plan();
    await logTrackActivity(p.publicId, { type: "call", note: "Left a voicemail" });
    const [call] = await actsOf(p.inquiryId, "call");
    expect(call).toMatchObject({ orderId: p.id, note: "Left a voicemail" });
  });

  it("openRenewal opens the round once, as auto", async () => {
    const p = await plan();
    expect(await openRenewal(p.id)).toBe("opened");
    expect(await inqRow(p.inquiryId)).toMatchObject({ renewalStatus: "expected", renewalStatusSource: "auto", currentOrderId: p.id });
    expect(await openRenewal(p.id)).toBe("skipped");
    expect(await actsOf(p.inquiryId, "renewal_started")).toHaveLength(1);
  });

  it("openRenewal skips an order that already has a later plan", async () => {
    const first = await plan();
    await plan(first.email, 21);
    expect(await openRenewal(first.id)).toBe("skipped");
  });

  it("logReminderSent dedupes on the reminder key", async () => {
    const p = await plan();
    await logReminderSent(p.id, "renewal:x:2035-01-05:1");
    await logReminderSent(p.id, "renewal:x:2035-01-05:1");
    expect(await actsOf(p.inquiryId, "reminder_sent")).toHaveLength(1);
  });

  it("openRenewalsDue opens rounds for plans ending within 7 days, trials included, and only those", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const soon = await plan();
    const trial = await plan();
    const far = await plan();
    await db.update(orders).set({ trialLength: 3 }).where(eq(orders.id, trial.id));
    // Last tiffin = max non-cancelled delivery date: keep one delivery per order and move it.
    const endOn = async (orderId: bigint, date: string) => {
      const [keep] = await db.select({ id: deliveries.id }).from(deliveries).where(eq(deliveries.orderId, orderId)).limit(1);
      await db.delete(deliveries).where(and(eq(deliveries.orderId, orderId), ne(deliveries.id, keep.id)));
      await db.update(deliveries).set({ deliveryDate: date }).where(eq(deliveries.id, keep.id));
    };
    await endOn(soon.id, addDaysIso(today, 3));
    await endOn(trial.id, addDaysIso(today, 3));
    await endOn(far.id, addDaysIso(today, 30));
    const opened = await openRenewalsDue(today);
    expect(opened).toBe(2);
    expect((await inqRow(soon.inquiryId)).renewalStatus).toBe("expected");
    expect((await inqRow(trial.inquiryId)).renewalStatus).toBe("expected");
    expect((await inqRow(far.inquiryId)).renewalStatus).toBeNull();
  });

  it("a note on an order whose buyer has no inquiry is kept (an inquiry is created for it)", async () => {
    const p = await plan();
    await db.delete(inquiryActivities).where(eq(inquiryActivities.inquiryId, p.inquiryId));
    await db.delete(inquiries).where(eq(inquiries.id, p.inquiryId));
    const { addTrackNote } = await import("../renewal-tracking.service");
    await addTrackNote(p.publicId, "Called, no answer");
    const notes = await db.select().from(inquiryActivities).where(and(eq(inquiryActivities.orderId, p.id), eq(inquiryActivities.type, "note")));
    expect(notes.map((n) => n.note)).toEqual(["Called, no answer"]);
  });
});

