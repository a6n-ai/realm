import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RenewalRange } from "../renewals.service";
import { eq, inArray, ne, sql } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deleteNonSystemUsers } = await import("@/db/test-helpers");
const { orders, payments, orderActivities, ledgerEntries, users, walletLedger, deliveries, notifications, notificationOutbox } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { nextWeekday } = await import("@foundry/commons");
const { createOrder } = await import("../create-order");
const { countRenewals, getCustomerRenewal, listRenewals, listRenewedCustomers, reminderDelivery } = await import("../renewals.service");
const { addTrackNote, setTrackStatus } = await import("../renewal-tracking.service");
const { messageSuppression } = await import("@/db/schema");
const { addDaysIso: addDays, dayRange } = await import("@foundry/commons/util/dates");

async function reset() {
  await db.delete(walletLedger);
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  const customerIds = db.select({ id: users.id }).from(users).where(ne(users.isSystem, true));
  await db.delete(notificationOutbox).where(inArray(notificationOutbox.recipientId, customerIds));
  await db.delete(notifications).where(inArray(notifications.userId, customerIds));
  await deleteNonSystemUsers();
}

let phone = 700;
async function plan(status: "active" | "completed" = "active") {
  const snap = await loadCatalogSnapshot();
  const o = await createOrder({
    planKey: snap.plans[0].key,
    selections: {
      mealSizeId: snap.mealSizes[0].publicId,
      frequencyKey: "5_day" as const,
      persons: 1,
      mealSlots: ["lunch"],
      includeSaturday: false,
      includeSunday: false,
      durationWeeks: 1,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: { email: `n${Math.random().toString(36).slice(2)}@test.invalid`, fullName: "Nia Renew", phone: `+16475550${phone++}`, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  const [row] = await db.update(orders).set({ status }).where(eq(orders.publicId, o.publicId)).returning({ id: orders.id, userId: orders.userId });
  const [u] = await db.select({ publicId: users.publicId }).from(users).where(eq(users.id, row.userId!));
  const [{ last }] = await db.select({ last: sql<string>`max(${deliveries.deliveryDate})` }).from(deliveries).where(eq(deliveries.orderId, row.id));
  return { publicId: o.publicId, id: row.id, userId: row.userId!, customerPublicId: u.publicId, last };
}

const page = { page: 0, size: 50 };
const ids = (p: { items: { orderPublicId: string }[] }) => p.items.map((r) => r.orderPublicId);

describe("renewals service (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  const open: RenewalRange = { by: "last", fromIso: null, toIso: null, fromMs: null, toMs: null };
  const noDay = { dayStart: 0, dayEnd: 0 };
  const f0 = { tab: "renewals" as const, type: null, track: null, followUp: null, dateBy: "last" as const, ending: null, ended: null, status: null, renewed: null, from: null, to: null, q: "" };

  it("ending window: today through N days out, both ends included", async () => {
    const p = await plan();
    const f = (ending: number) => ({ ...f0, ending });
    expect(ids(await listRenewals("all", f(0), p.last, page, open, noDay))).toEqual([p.publicId]);
    expect(ids(await listRenewals("all", f(2), addDays(p.last, -2), page, open, noDay))).toEqual([p.publicId]);
    expect(ids(await listRenewals("all", f(1), addDays(p.last, -2), page, open, noDay))).toEqual([]);
    // Already ended: not "ending".
    expect(ids(await listRenewals("all", f(7), addDays(p.last, 1), page, open, noDay))).toEqual([]);
  });

  it("top date range: last tiffin, ordered or running in range", async () => {
    const p = await plan();
    const [o] = await db.select({ start: orders.startDate, createdAt: orders.createdAt }).from(orders).where(eq(orders.id, p.id));
    const by = (r: Partial<RenewalRange>) => listRenewals("all", f0, p.last, page, { ...open, ...r }, noDay).then(ids);
    expect(await by({ fromIso: p.last, toIso: p.last })).toEqual([p.publicId]);
    expect(await by({ fromIso: addDays(p.last, 1), toIso: addDays(p.last, 30) })).toEqual([]);
    expect(await by({ by: "ordered", fromMs: o.createdAt - 1000, toMs: o.createdAt + 1000 })).toEqual([p.publicId]);
    expect(await by({ by: "ordered", fromMs: 0, toMs: 1 })).toEqual([]);
    // Running: any delivery inside the range, even a range that ends before the last tiffin.
    expect(await by({ by: "running", fromIso: o.start, toIso: o.start })).toEqual([p.publicId]);
    expect(await by({ by: "running", fromIso: addDays(p.last, 1), toIso: addDays(p.last, 5) })).toEqual([]);
  });

  it("top date range: next plan booked in range dates the plan by its renewal", async () => {
    const p = await plan();
    const by = (r: Partial<RenewalRange>) => listRenewals("all", f0, p.last, page, { ...open, by: "renewed", ...r }, noDay).then(ids);
    expect(await by({})).toEqual([]);
    const next = await plan();
    const bookedAt = Date.parse("2099-01-01T15:00:00Z");
    await db.update(orders).set({ userId: p.userId, startDate: "2099-01-05", status: "pending", createdAt: bookedAt }).where(eq(orders.id, next.id));
    expect(await by({ fromMs: bookedAt - 1000, toMs: bookedAt + 1000 })).toEqual([p.publicId]);
    expect(await by({ fromMs: bookedAt + 1000, toMs: bookedAt + 2000 })).toEqual([]);
  });

  it("ended window lists plans that are over; Status narrows to lapsed or renewed", async () => {
    const running = await plan();
    const done = await plan("completed");
    const today = addDays(running.last, 3);
    const ended = { ...f0, ended: 7 };
    const listed = await listRenewals("all", ended, today, page, open, noDay);
    expect(new Set(ids(listed))).toEqual(new Set([running.publicId, done.publicId]));
    expect(listed.items.every((r) => r.status === "none")).toBe(true);

    // Status: Lapsed keeps the ended ones; Not renewed wants a running plan, so none here.
    expect(new Set(ids(await listRenewals("all", { ...ended, status: "lapsed" }, today, page, open, noDay)))).toEqual(new Set([running.publicId, done.publicId]));
    expect(ids(await listRenewals("all", { ...ended, status: "not_renewed" }, today, page, open, noDay))).toEqual([]);

    // A later plan (even unpaid) moves it out of Lapsed; it is still an ended plan.
    const next = await plan();
    await db.update(orders).set({ userId: running.userId, startDate: "2099-01-05", status: "pending" }).where(eq(orders.id, next.id));
    expect(ids(await listRenewals("all", { ...ended, status: "lapsed" }, today, page, open, noDay))).toEqual([done.publicId]);
    expect(new Set(ids(await listRenewals("all", ended, today, page, open, noDay)))).toEqual(new Set([running.publicId, done.publicId]));
  });

  it("type narrows to trials or regular plans and respects org visibility", async () => {
    const paid = await plan();
    const trial = await plan();
    await db.update(orders).set({ trialLength: 3 }).where(eq(orders.id, trial.id));
    const f = (type: "regular" | "trial" | null) => ({ ...f0, type, ending: 7 });
    const today = addDays(paid.last, -1);
    expect(ids(await listRenewals("all", f("regular"), today, page, open, noDay))).toEqual([paid.publicId]);
    expect(ids(await listRenewals("all", f("trial"), today, page, open, noDay))).toEqual([trial.publicId]);
    expect(new Set(ids(await listRenewals("all", f(null), today, page, open, noDay)))).toEqual(new Set([paid.publicId, trial.publicId]));
    expect(ids(await listRenewals([], f("regular"), today, page, open, noDay))).toEqual([]);
    expect(ids(await listRenewals(["no-such-org"], f("regular"), today, page, open, noDay))).toEqual([]);
  });

  it("track: new is an untouched plan; a staff status narrows; an auto-renewed plan reads renewed", async () => {
    const done = await plan("completed");
    const untouched = await plan();
    const touched = await plan();
    const next = await plan();
    await db.update(orders).set({ userId: done.userId, startDate: "2099-01-05", status: "active" }).where(eq(orders.id, next.id));
    await setTrackStatus(touched.publicId, { status: "follow_up" });
    await addTrackNote(touched.publicId, "Asked for Friday");

    const trackOf = async (track: ("new" | "follow_up" | "renewed")[]) => new Set(ids(await listRenewals("all", { ...f0, track }, touched.last, page, open, noDay)));
    expect(await trackOf(["new"])).toEqual(new Set([untouched.publicId, next.publicId]));
    expect(await trackOf(["follow_up"])).toEqual(new Set([touched.publicId]));
    expect(await trackOf(["renewed"])).toEqual(new Set([done.publicId]));

    const row = (await listRenewals("all", { ...f0, track: ["follow_up"] }, touched.last, page, open, noDay)).items[0];
    expect(row).toMatchObject({ track: "follow_up", trackSource: "staff", trial: false, lastActivity: { type: "note", note: "Asked for Friday" } });
  });

  it("follow-up due today lists a plan whose last tiffin is long past, ignoring the ending window", async () => {
    const p = await plan("completed");
    const today = addDays(p.last, 30);
    await setTrackStatus(p.publicId, { status: "follow_up", nextFollowUpAt: Date.parse(`${today}T12:00:00Z`) });
    const day = dayRange(today, "UTC");
    const dueDay = { dayStart: day.start, dayEnd: day.end };
    expect(ids(await listRenewals("all", { ...f0, ending: 7, followUp: "due" }, today, page, open, dueDay))).toEqual([p.publicId]);
    expect(ids(await listRenewals("all", { ...f0, followUp: "overdue" }, today, page, open, dueDay))).toEqual([]);
    expect(ids(await listRenewals("all", { ...f0, followUp: "none" }, today, page, open, dueDay))).toEqual([]);
  });

  it("follow-up none keeps the top date range", async () => {
    const p = await plan("completed");
    const none = { ...f0, followUp: "none" as const };
    const on = (day: string) => listRenewals("all", none, p.last, page, { ...open, fromIso: day, toIso: day }, noDay).then(ids);
    expect(await on(addDays(p.last, 30))).toEqual([]);
    expect(await on(p.last)).toEqual([p.publicId]);
  });

  it("rows carry the fact chips and money, and the cards match the list", async () => {
    const before = await plan("completed");
    const p = await plan();
    await db.update(orders).set({ userId: before.userId, startDate: addDays(p.last, -60), total: "88.00", createdAt: 1 }).where(eq(orders.id, before.id));
    await db.update(orders).set({ userId: before.userId }).where(eq(orders.id, p.id));
    const [held] = await db.select({ id: deliveries.id }).from(deliveries).where(eq(deliveries.orderId, p.id)).limit(1);
    await db.update(deliveries).set({ status: "skipped" }).where(eq(deliveries.id, held.id));
    await db.insert(walletLedger).values({ userId: before.userId, direction: "credit", eventType: "order_activated", sourceType: "order", sourceId: `renewals-${p.id}`, coins: 42, orderId: p.id });

    const today = addDays(p.last, -1);
    const list = await listRenewals("all", f0, today, page, open, noDay);
    expect(list.items.find((r) => r.orderPublicId === p.publicId)).toMatchObject({ priorPlans: 1, holds: 1, openTickets: 0, walletCoins: 42, prevOrderTotal: "88.00", status: "none" });
    expect(list.items.find((r) => r.orderPublicId === before.publicId)?.planTotal).toBe("88.00");

    // Cards cover the same plans as the unfiltered list: the earlier plan is renewed by this one, this one is still running.
    const cards = await countRenewals("all", null, today, open);
    expect(cards).toEqual({ plans: list.total, renewed: 1, renewedNotPaid: 0, notRenewed: 1, lapsed: 0 });

    // Status and search narrow the list; search matches name, code or phone.
    expect(ids(await listRenewals("all", { ...f0, status: "not_renewed" }, today, page, open, noDay))).toContain(p.publicId);
    expect(ids(await listRenewals("all", { ...f0, status: "renewed" }, today, page, open, noDay))).toEqual([before.publicId]);
    expect(ids(await listRenewals("all", { ...f0, q: "nia renew" }, today, page, open, noDay))).toContain(p.publicId);
    expect(ids(await listRenewals("all", { ...f0, q: "nobody-like-this" }, today, page, open, noDay))).toEqual([]);
  });

  it("renewed customers: only customers with a renewal, newest first, with counts and the plan running now", async () => {
    const first = await plan("completed");
    const second = await plan();
    await db.update(orders).set({ userId: first.userId, startDate: "2099-01-05" }).where(eq(orders.id, second.id));
    await plan(); // a one-plan customer never shows

    const all = await listRenewedCustomers("all", { renewedWithin: null, q: "" }, page);
    expect(all.total).toBe(1);
    expect(all.items[0]).toMatchObject({ customerPublicId: first.customerPublicId, plans: 2, renewals: 1, currentMealSize: expect.any(String) });
    expect((await listRenewedCustomers("all", { renewedWithin: 7, q: "" }, page)).total).toBe(1);
    // Renewed "long ago": the window excludes it.
    expect((await listRenewedCustomers("all", { renewedWithin: 7, q: "", now: Date.now() + 30 * 86_400_000 }, page)).total).toBe(0);
    expect((await listRenewedCustomers([], { renewedWithin: null, q: "" }, page)).total).toBe(0);
  });

  it("customer renewal: plans oldest first with what followed and the gap, plus renewal reminders", async () => {
    const first = await plan("completed");
    const second = await plan();
    await db.update(orders).set({ userId: first.userId, startDate: addDays(first.last, 3) }).where(eq(orders.id, second.id));
    await db.insert(notificationOutbox).values({
      recipientId: first.userId, channel: "email", event: "order_renewal_reminder", payload: {},
      dedupeKey: `renewal:${first.publicId}:${first.last}:5:email`,
    });

    const r = await getCustomerRenewal("all", first.customerPublicId);
    expect(r?.plans.map((p) => [p.orderPublicId, p.next, p.gapDays])).toEqual([[first.publicId, "renewed", 3], [second.publicId, "none", null]]);
    expect(r?.reminders).toMatchObject([{ orderPublicId: first.publicId, daysLeft: 5, delivery: "queued" }]);
    expect(r?.emailBlock).toBeNull();

    // AWS reports delivery, then the customer reports it as spam: the reminder reads Marked spam and the address is blocked.
    await db.update(notificationOutbox).set({ status: "sent", deliveredAt: Date.now() }).where(eq(notificationOutbox.recipientId, first.userId));
    expect((await getCustomerRenewal("all", first.customerPublicId))?.reminders[0].delivery).toBe("delivered");
    const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, first.userId));
    await db.insert(messageSuppression).values({ address: u.email!.toLowerCase(), channel: "email", scope: "all", reason: "SES complaint", createdAt: Date.now() + 1000 });
    const blocked = await getCustomerRenewal("all", first.customerPublicId);
    expect(blocked?.reminders[0].delivery).toBe("spam");
    expect(blocked?.emailBlock?.reason).toBe("complaint");
    await db.delete(messageSuppression).where(eq(messageSuppression.address, u.email!.toLowerCase()));
    // A reminder for a plan this staff member cannot see (another franchise) is left out.
    await db.insert(notificationOutbox).values({ recipientId: first.userId, channel: "email", event: "order_renewal_reminder", payload: {}, dedupeKey: "renewal:ord_elsewhere:2026-01-01:1:email" });
    expect((await getCustomerRenewal("all", first.customerPublicId))?.reminders.map((x) => x.orderPublicId)).toEqual([first.publicId]);
    expect(await getCustomerRenewal(["no-such-org"], first.customerPublicId)).toBeNull();
    expect(await getCustomerRenewal("all", "usr_missing")).toBeNull();
  });

  it("customer renewal: each plan carries its track and its own activities", async () => {
    const first = await plan("completed");
    const second = await plan();
    await db.update(orders).set({ userId: first.userId, startDate: addDays(first.last, 3) }).where(eq(orders.id, second.id));
    await addTrackNote(first.publicId, "Asked for Friday");

    const r = await getCustomerRenewal("all", first.customerPublicId);
    expect(r?.plans.map((p) => p.activities.length)).toEqual([2, 0]);
    expect(r?.plans[0].activities[0]).toMatchObject({ type: "note", note: "Asked for Friday" });
    expect(r?.plans.map((p) => p.track)).toEqual([
      { status: "renewed", source: "auto", lostReason: null, nextFollowUpAt: null, laterBookedAt: expect.any(Number) },
      { status: null, source: null, lostReason: null, nextFollowUpAt: null, laterBookedAt: null },
    ]);
  });

  it("customer renewal: an auto-renewed plan logs when the next plan was booked", async () => {
    const first = await plan("completed");
    const second = await plan();
    await db.update(orders).set({ userId: first.userId, startDate: addDays(first.last, 3) }).where(eq(orders.id, second.id));
    const [booked] = await db.select({ createdAt: orders.createdAt }).from(orders).where(eq(orders.id, second.id));
    await addTrackNote(first.publicId, "Asked for Friday");

    const acts = (await getCustomerRenewal("all", first.customerPublicId))!.plans[0].activities;
    expect(acts.map((a) => [a.type, a.toStatus])).toEqual([["note", null], ["status_change", "renewed"]]);
    expect(acts[1]).toMatchObject({
      publicId: `auto-${first.publicId}`,
      fromStatus: null,
      note: "New plan booked",
      createdAt: Number(booked.createdAt),
      actor: { label: "System", kind: "system" },
    });
  });

  it("reminder delivery: failed, queued, sent, delivered, bounced and spam from the outbox row and the address block", () => {
    const at = 1_000;
    expect(reminderDelivery("failed", null, at, null)).toBe("failed");
    expect(reminderDelivery("processing", null, at, null)).toBe("queued");
    expect(reminderDelivery("sent", null, at, null)).toBe("sent");
    expect(reminderDelivery("sent", 2_000, at, null)).toBe("delivered");
    expect(reminderDelivery("sent", null, at, { reason: "bounce", since: 1_500 })).toBe("bounced");
    expect(reminderDelivery("sent", 2_000, at, { reason: "complaint", since: 3_000 })).toBe("spam");
    // A block from before this send is not what this send ran into.
    expect(reminderDelivery("sent", 2_000, at, { reason: "complaint", since: 500 })).toBe("delivered");
  });
});
