import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, ne, sql } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { orders, payments, orderActivities, ledgerEntries, users, walletLedger, deliveries, notifications, notificationOutbox } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { nextWeekday } = await import("@foundry/commons");
const { createOrder } = await import("../orders.service");
const { countRenewals, listRenewals } = await import("../renewals.service");
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
  const [{ last }] = await db.select({ last: sql<string>`max(${deliveries.deliveryDate})` }).from(deliveries).where(eq(deliveries.orderId, row.id));
  return { publicId: o.publicId, id: row.id, userId: row.userId!, last };
}

const page = { page: 0, size: 50 };
const ids = (p: { items: { orderPublicId: string }[] }) => p.items.map((r) => r.orderPublicId);

describe("renewals service (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("ending window: today through N days out, both ends included", async () => {
    const p = await plan();
    const f = (ending: number) => ({ tab: "renewals" as const, ending, ended: null });
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
    const lapsed = { tab: "renewals" as const, ending: null, ended: 7 };
    const listed = await listRenewals("all", lapsed, today, page);
    expect(new Set(ids(listed))).toEqual(new Set([running.publicId, done.publicId]));
    expect(listed.items.every((r) => r.status === "none")).toBe(true);

    // A later plan (even unpaid) takes it off the lapsed list.
    const next = await plan();
    await db.update(orders).set({ userId: running.userId, startDate: "2099-01-05", status: "pending" }).where(eq(orders.id, next.id));
    expect(ids(await listRenewals("all", lapsed, today, page))).toEqual([done.publicId]);
  });

  it("splits trials from paid plans and respects org visibility", async () => {
    const paid = await plan();
    const trial = await plan();
    await db.update(orders).set({ trialLength: 3 }).where(eq(orders.id, trial.id));
    const f = (tab: "renewals" | "trials") => ({ tab, ending: 7, ended: null });
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
    const list = await listRenewals("all", { tab: "renewals", ending: 7, ended: null }, today, page);
    expect(list.items.find((r) => r.orderPublicId === p.publicId)).toMatchObject({ priorPlans: 1, holds: 1, openTickets: 0, walletCoins: 42, prevOrderTotal: "88.00", status: "none" });

    const cards = await countRenewals("all", "renewals", today, 30);
    expect(cards.endingWithin7).toBe(list.total);
    expect(cards.endingToday).toBe(0);
  });
});
