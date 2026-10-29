import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, ne, sql } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { orders, payments, orderActivities, ledgerEntries, users, walletLedger, deliveries, notifications, notificationOutbox } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { nextWeekday } = await import("@foundry/commons");
const { createOrder } = await import("../orders.service");
const { countRenewals, getCustomerRenewal, listRenewals, listRenewedCustomers, reminderDelivery } = await import("../renewals.service");
const { messageSuppression } = await import("@/db/schema");
const { addDays } = await import("@/lib/deliveries-view/week");

async function reset() {
  await db.delete(walletLedger);
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  const customerIds = db.select({ id: users.id }).from(users).where(ne(users.isSystem, true));
  await db.delete(notificationOutbox).where(inArray(notificationOutbox.recipientId, customerIds));
  await db.delete(notifications).where(inArray(notifications.userId, customerIds));
  await db.delete(users).where(ne(users.isSystem, true));
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

  it("ending window: today through N days out, both ends included", async () => {
    const p = await plan();
    const f = (ending: number) => ({ tab: "renewals" as const, ending, ended: null, status: null, renewed: null, from: null, to: null, q: "" });
    expect(ids(await listRenewals("all", f(0), p.last, page))).toEqual([p.publicId]);
    expect(ids(await listRenewals("all", f(2), addDays(p.last, -2), page))).toEqual([p.publicId]);
    expect(ids(await listRenewals("all", f(1), addDays(p.last, -2), page))).toEqual([]);
    // Already ended: not "ending".
    expect(ids(await listRenewals("all", f(7), addDays(p.last, 1), page))).toEqual([]);
  });

  it("ended window lists only lapsed plans, completed or not yet closed", async () => {
    const running = await plan();
    const done = await plan("completed");
    const today = addDays(running.last, 3);
    const lapsed = { tab: "renewals" as const, ending: null, ended: 7, status: null, renewed: null, from: null, to: null, q: "" };
    const listed = await listRenewals("all", lapsed, today, page);
    expect(new Set(ids(listed))).toEqual(new Set([running.publicId, done.publicId]));
    expect(listed.items.every((r) => r.status === "none")).toBe(true);

    // Status: Lapsed keeps the ended ones; Not renewed wants a running plan, so none here.
    expect(new Set(ids(await listRenewals("all", { ...lapsed, status: "lapsed" }, today, page)))).toEqual(new Set([running.publicId, done.publicId]));
    expect(ids(await listRenewals("all", { ...lapsed, status: "not_renewed" }, today, page))).toEqual([]);
    // Order date: a range that ends before these were ordered empties the list.
    expect(ids(await listRenewals("all", { ...lapsed, to: 1 }, today, page))).toEqual([]);

    // A later plan (even unpaid) takes it off the lapsed list.
    const next = await plan();
    await db.update(orders).set({ userId: running.userId, startDate: "2099-01-05", status: "pending" }).where(eq(orders.id, next.id));
    expect(ids(await listRenewals("all", lapsed, today, page))).toEqual([done.publicId]);
  });

  it("splits trials from paid plans and respects org visibility", async () => {
    const paid = await plan();
    const trial = await plan();
    await db.update(orders).set({ trialLength: 3 }).where(eq(orders.id, trial.id));
    const f = (tab: "renewals" | "trials") => ({ tab, ending: 7, ended: null, status: null, renewed: null, from: null, to: null, q: "" });
    const today = addDays(paid.last, -1);
    expect(ids(await listRenewals("all", f("renewals"), today, page))).toEqual([paid.publicId]);
    expect(ids(await listRenewals("all", f("trials"), today, page))).toEqual([trial.publicId]);
    expect(ids(await listRenewals([], f("renewals"), today, page))).toEqual([]);
    expect(ids(await listRenewals(["no-such-org"], f("renewals"), today, page))).toEqual([]);
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
    const list = await listRenewals("all", { tab: "renewals", ending: 7, ended: null, status: null, renewed: null, from: null, to: null, q: "" }, today, page);
    expect(list.items.find((r) => r.orderPublicId === p.publicId)).toMatchObject({ priorPlans: 1, holds: 1, openTickets: 0, walletCoins: 42, prevOrderTotal: "88.00", status: "none" });

    const cards = await countRenewals("all", "renewals", today, 30);
    expect(cards.endingWithin7).toBe(list.total);
    expect(cards.endingToday).toBe(0);
    // The earlier plan ends in the same window and is renewed by this one.
    expect(cards.renewed).toBe(1);

    // Status and search narrow the list; search matches name, code or phone.
    const f = { tab: "renewals" as const, ending: 7, ended: null, renewed: null, from: null, to: null, q: "" };
    expect(ids(await listRenewals("all", { ...f, status: "not_renewed" }, today, page))).toContain(p.publicId);
    expect(ids(await listRenewals("all", { ...f, status: "renewed" }, today, page))).toEqual([]);
    expect(ids(await listRenewals("all", { ...f, status: null, q: "nia renew" }, today, page))).toContain(p.publicId);
    expect(ids(await listRenewals("all", { ...f, status: null, q: "nobody-like-this" }, today, page))).toEqual([]);
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
