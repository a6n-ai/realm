import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ne, sql } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const session: { user: { id: string; role: string } | null } = { user: null };
vi.mock("@/lib/auth/session", () => ({ getSession: async () => (session.user ? session : null) }));

const { db } = await import("@/db/client");
const { orders, payments, orderActivities, ledgerEntries, users, walletLedger, notifications, notificationOutbox } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { nextWeekday } = await import("@foundry/commons");
const { createOrder } = await import("../orders.service");
const { listOrdersPage, ordersListWhere, refundOrder, readOrder, resolveSessionVisibleOrgIds, assertDeliveryVisible, assertPaymentVisible, setOrderLookOut, lookOutForTicket, clearTicketLookOut, countLookOutOrders, countPaymentReviewOrders, countFreeTiffinOrders, laterOrderSql, laterPaidOrderSql, renewalStatusSql } = await import("../orders.service");
const { clearLookOutOnEnd } = await import("@/lib/orders/look-out");
const { ticketsService } = await import("../tickets.service");
const { ledgerService } = await import("../ledger.service");
const { eq: cEq } = await import("@foundry/commons/model/condition");
const { organization, member } = await import("@/db/schema");
const schema = await import("@/db/schema");
const { and, eq, inArray } = await import("drizzle-orm");

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

const baseInput = (mealSizePublicId: string, planKey: string, fullName = "Jane Customer", phone = "+16475550111") => ({
  planKey,
  selections: {
    mealSizeId: mealSizePublicId,
    frequencyKey: "5_day" as const,
    persons: 1,
    mealSlots: ["lunch"],
    includeSaturday: false,
    includeSunday: false,
    durationWeeks: 1,
    startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
  },
  contact: { email: `u${Math.random().toString(36).slice(2)}@test.invalid`,  fullName, phone, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
});

describe("order CRM queries (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("renewed rule: any later plan counts, unpaid and waitlisted included; status ranks renewed > unpaid > waitlisted", async () => {
    const snap = await loadCatalogSnapshot();
    // A fresh phone per plan: createOrder would reject a second overlapping plan for one customer.
    let phone = 600;
    const plan = () => createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key, "Rae Renew", `+16475550${phone++}`));
    const o = await plan();
    await db.update(orders).set({ status: "active" }).where(eq(orders.publicId, o.publicId));
    const [first] = await db.select({ userId: orders.userId }).from(orders).where(eq(orders.publicId, o.publicId));
    const of = async () => (await db.select({ later: laterOrderSql, laterPaid: laterPaidOrderSql, status: renewalStatusSql(), paidOnly: renewalStatusSql(true) })
      .from(orders).where(eq(orders.publicId, o.publicId)))[0];
    const later = async (startDate: string) => {
      const n = await plan();
      const [row] = await db.update(orders).set({ userId: first.userId, startDate, status: "pending" }).where(eq(orders.publicId, n.publicId)).returning({ id: orders.id });
      return row.id;
    };
    const setPayments = async (orderId: bigint, status: "paid" | "awaiting_payment" | "pending") => {
      const rows = await db.update(payments).set({ status }).where(eq(payments.orderId, orderId)).returning({ id: payments.id });
      expect(rows.length).toBeGreaterThan(0);
    };

    expect(await of()).toEqual({ later: false, laterPaid: false, status: "none", paidOnly: "none" });

    const next = await later("2099-01-05");
    await setPayments(next, "awaiting_payment");
    expect(await of()).toMatchObject({ later: true, status: "unpaid" });

    await setPayments(next, "paid");
    expect(await of()).toMatchObject({ later: true, status: "renewed" });

    await setPayments(next, "pending");
    await db.update(orders).set({ status: "waitlisted" }).where(eq(orders.id, next));
    expect(await of()).toMatchObject({ later: true, status: "waitlisted" });

    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, next));
    expect(await of()).toMatchObject({ later: false, status: "none" });

    // A later trial counts as a later plan, but not as a trial conversion.
    await db.update(orders).set({ status: "active", trialLength: 3 }).where(eq(orders.id, next));
    expect(await of()).toEqual({ later: true, laterPaid: false, status: "renewed", paidOnly: "none" });

    // An unpaid next plan with a running one after it reads Renewed, not Unpaid.
    await db.update(orders).set({ status: "cancelled", trialLength: null }).where(eq(orders.id, next));
    const unpaid = await later("2099-01-05");
    await setPayments(unpaid, "awaiting_payment");
    const running = await later("2099-02-02");
    await db.update(orders).set({ status: "active" }).where(eq(orders.id, running));
    expect(await of()).toEqual({ later: true, laterPaid: true, status: "renewed", paidOnly: "renewed" });

    // A parallel plan that starts later but ends first is not a renewal.
    await db.update(orders).set({ status: "cancelled" }).where(inArray(orders.id, [unpaid, running]));
    const parallel = await later("2099-01-05");
    await db.update(orders).set({ status: "active" }).where(eq(orders.id, parallel));
    const [{ last }] = await db.select({ last: sql<string>`max(${schema.deliveries.deliveryDate})` }).from(schema.deliveries).innerJoin(orders, eq(orders.id, schema.deliveries.orderId)).where(eq(orders.publicId, o.publicId));
    await db.delete(schema.deliveries).where(and(eq(schema.deliveries.orderId, parallel), eq(schema.deliveries.deliveryDate, last)));
    expect(await of()).toMatchObject({ later: false, status: "none" });
  });

  it("free tiffins: lists and counts orders where staff gave tiffins on top, cancelled left out", async () => {
    const snap = await loadCatalogSnapshot();
    const given = await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key, "Fay Free", "+16475550901"));
    await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key, "Nan None", "+16475550902"));
    await db.update(orders).set({ complimentaryTiffins: 2 }).where(eq(orders.publicId, given.publicId));

    const free = await listOrdersPage(undefined, { page: 0, size: 10 }, undefined, "all", { freeTiffins: true });
    expect(free.items.map((r) => [r.publicId, r.freeTiffins])).toEqual([[given.publicId, 2]]);
    expect(await countFreeTiffinOrders("all")).toBe(1);

    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.publicId, given.publicId));
    expect(await countFreeTiffinOrders("all")).toBe(0);
  });

  it("orders overview: counts new orders, returning customers, running plans and renewals", async () => {
    const { getOrdersOverview } = await import("../orders-stats.service");
    const snap = await loadCatalogSnapshot();
    const a = await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key));
    await db.update(orders).set({ status: "active", trialLength: null }).where(eq(orders.publicId, a.publicId));
    const now = Date.now();
    const range = { from: now - 864e5, to: now + 864e5 };

    const first = await getOrdersOverview(range, "all");
    expect(first.newOrders).toMatchObject({ count: 1, returning: 0, prevCount: 0 });
    expect(first.running.count).toBe(1);
    expect(await getOrdersOverview(range, [])).toMatchObject({ newOrders: { count: 0 }, running: { count: 0 } });

    // Same customer books again: the second order is returning.
    const b = await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key, "Bob Buyer", "+16475550222"));
    const [{ userId }] = await db.select({ userId: orders.userId }).from(orders).where(eq(orders.publicId, a.publicId));
    await db.update(orders).set({ userId, startDate: "2099-01-05", status: "pending" }).where(eq(orders.publicId, b.publicId));
    expect((await getOrdersOverview(range, "all")).newOrders).toMatchObject({ count: 2, returning: 1 });

    // Starting soon: an unpaid plan whose first tiffin is a day out counts; 2099 does not.
    const soon = new Date(now + 864e5).toISOString().slice(0, 10);
    await db.update(orders).set({ startDate: "2099-01-05" }).where(eq(orders.publicId, a.publicId));
    expect((await getOrdersOverview(range, "all")).startingSoon).toMatchObject({ count: 0 });
    await db.update(orders).set({ startDate: soon }).where(eq(orders.publicId, b.publicId));
    expect((await getOrdersOverview(range, "all")).startingSoon).toMatchObject({ count: 1, unpaid: 1, waitlisted: 0 });

    // Cancelled counts by the cancel activity's date, not the order's.
    const [{ id: bId }] = await db.select({ id: orders.id }).from(orders).where(eq(orders.publicId, b.publicId));
    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, bId));
    await db.insert(orderActivities).values({ orderId: bId, type: "cancelled", fromStatus: "pending", toStatus: "cancelled" });
    expect((await getOrdersOverview(range, "all")).cancelled).toMatchObject({ count: 1, prevCount: 0 });
    expect((await getOrdersOverview(range, [])).cancelled.count).toBe(0);
  });

  it("payment review: only open orders with a payment awaiting claim or verification", async () => {
    const snap = await loadCatalogSnapshot();
    const o = await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key));
    await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key, "Bob Buyer", "+16475550222"));
    const [row] = await db.select({ id: orders.id }).from(orders).where(eq(orders.publicId, o.publicId));
    await db.update(payments).set({ status: "paid" });
    expect(await countPaymentReviewOrders("all")).toBe(0);

    await db.update(payments).set({ status: "pending_verification" }).where(eq(payments.orderId, row.id));
    await db.update(orders).set({ status: "active" }).where(eq(orders.id, row.id));
    const page = await listOrdersPage(undefined, { page: 0, size: 10 }, undefined, "all", { paymentReview: true });
    expect(page.items.map((r) => r.publicId)).toEqual([o.publicId]);
    expect(await countPaymentReviewOrders("all")).toBe(1);

    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, row.id));
    expect(await countPaymentReviewOrders("all")).toBe(0);
  });

  it("look out for: a flagged order gets its own list and count, and clearing takes it back out", async () => {
    const snap = await loadCatalogSnapshot();
    const flagged = await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key, "Jane Customer", "+16475550111"));
    await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key, "Bob Buyer", "+16475550222"));

    await expect(setOrderLookOut(flagged.publicId, true, "   ")).rejects.toThrow("Add a note");
    await setOrderLookOut(flagged.publicId, true, "  Call first  ");
    await setOrderLookOut(flagged.publicId, true, "  Call before delivery  ");
    const only = await listOrdersPage(undefined, { page: 0, size: 10 }, undefined, "all", { lookOutOnly: true });
    expect(only.items.map((o) => o.fullName)).toEqual(["Jane Customer"]);
    expect(only.items[0]).toMatchObject({ lookOut: true, lookOutNote: "Call before delivery" });
    expect(await countLookOutOrders("all")).toBe(1);
    expect(await countLookOutOrders([])).toBe(0);
    expect((await listOrdersPage(undefined, { page: 0, size: 10 }, undefined, "all")).total).toBe(2);

    await expect(setOrderLookOut(flagged.publicId, false, "")).rejects.toThrow("why it is being unmarked");
    await setOrderLookOut(flagged.publicId, false, "Sorted with customer");
    expect(await countLookOutOrders("all")).toBe(0);
    const notes = await db.select({ note: orderActivities.note }).from(orderActivities).where(eq(orderActivities.type, "note"));
    expect(notes.map((n) => n.note).sort()).toEqual(["Look out for cleared: Sorted with customer", "Look out for note changed: Call before delivery", "Marked look out for: Call first"]);
  });

  it("look out for: a ticket flags its order, and leaves a flag staff already set", async () => {
    const snap = await loadCatalogSnapshot();
    const order = await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key));
    const [{ id }] = await db.select({ id: orders.id }).from(orders).where(eq(orders.publicId, order.publicId));
    const note = async () => (await db.select({ note: orders.lookOutNote }).from(orders).where(eq(orders.id, id)))[0].note;

    await lookOutForTicket(id, "Missing roti");
    expect(await note()).toBe("Support ticket: Missing roti");

    // Resolving clears it only once no other ticket on the order is still open.
    const [{ userId }] = await db.select({ userId: orders.userId }).from(orders).where(eq(orders.id, id));
    const [open] = await db.insert(schema.tickets).values({ publicId: "tkt_lookout_open", raisedBy: userId!, subject: "Still open", category: "order", orderId: id, createdAt: Date.now(), updatedAt: Date.now() }).returning({ id: schema.tickets.id });
    await clearTicketLookOut(id);
    expect(await note()).toBe("Support ticket: Missing roti");
    await db.delete(schema.tickets).where(eq(schema.tickets.id, open.id));
    await clearTicketLookOut(id);
    expect(await note()).toBeNull();

    await setOrderLookOut(order.publicId, true, "Call first", userId);
    await lookOutForTicket(id, "Late again");
    await clearTicketLookOut(id);
    expect(await note()).toBe("Call first");
  });

  it("look out for: the tab leads with the newest flag, and an ended order leaves it", async () => {
    const snap = await loadCatalogSnapshot();
    const jane = await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key, "Jane Customer", "+16475550111"));
    const bob = await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key, "Bob Buyer", "+16475550222"));
    await setOrderLookOut(bob.publicId, true, "Bob first");
    await setOrderLookOut(jane.publicId, true, "Jane later");
    // Jane's order is older but flagged later; set the time outright so one millisecond can't tie them.
    await db.update(orders).set({ lookOutAt: Date.now() + 60_000 }).where(eq(orders.publicId, jane.publicId));
    const tab = await listOrdersPage(undefined, { page: 0, size: 10 }, { column: "flagged", dir: "desc" }, "all", { lookOutOnly: true });
    expect(tab.items.map((o) => o.fullName)).toEqual(["Jane Customer", "Bob Buyer"]);

    const [{ id }] = await db.select({ id: orders.id }).from(orders).where(eq(orders.publicId, jane.publicId));
    await db.transaction((tx) => clearLookOutOnEnd(tx, id, "order cancelled"));
    await db.transaction((tx) => clearLookOutOnEnd(tx, id, "order cancelled"));
    expect(await countLookOutOrders("all")).toBe(1);
    const notes = await db.select({ note: orderActivities.note }).from(orderActivities).where(eq(orderActivities.orderId, id));
    expect(notes.filter((n) => n.note === "Look out for cleared: order cancelled")).toHaveLength(1);
  });

  it("look out for: reopening a resolved ticket puts its order back on the list", async () => {
    const snap = await loadCatalogSnapshot();
    const order = await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key));
    const [{ id, userId }] = await db.select({ id: orders.id, userId: orders.userId }).from(orders).where(eq(orders.publicId, order.publicId));
    const [staff] = await db.insert(users).values({ email: `s${Math.random().toString(36).slice(2)}@test.invalid`, name: "Staff", role: "admin" }).returning({ publicId: users.publicId });
    const [ticket] = await db.insert(schema.tickets).values({ publicId: "tkt_lookout_reopen", raisedBy: userId!, subject: "Missing roti", category: "order", orderId: id, createdAt: Date.now(), updatedAt: Date.now() }).returning();
    await lookOutForTicket(id, ticket.subject);
    session.user = { id: staff.publicId, role: "admin" };
    try {
      await ticketsService.changeStatus(ticket.publicId, "resolved");
      expect(await countLookOutOrders("all")).toBe(0);
      await ticketsService.changeStatus(ticket.publicId, "open");
      const [row] = await db.select({ note: orders.lookOutNote }).from(orders).where(eq(orders.id, id));
      expect(row.note).toBe("Support ticket: Missing roti");
    } finally {
      session.user = null;
      await db.delete(schema.ticketMessages).where(eq(schema.ticketMessages.ticketId, ticket.id));
      await db.delete(schema.tickets).where(eq(schema.tickets.id, ticket.id));
    }
  });

  it("listOrdersPage filters by Condition, search, and paginates with a total", async () => {
    const snap = await loadCatalogSnapshot();
    await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key, "Jane Customer", "+16475550111"));
    await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key, "Bob Buyer", "+16475550222"));

    // Page slice: 2 rows, size 1 -> first page has 1 item but total reflects all matches.
    const firstPage = await listOrdersPage(undefined, { page: 0, size: 1 }, undefined, "all");
    expect(firstPage.items.length).toBe(1);
    expect(firstPage.total).toBe(2);
    expect(firstPage.size).toBe(1);

    const secondPage = await listOrdersPage(undefined, { page: 1, size: 1 }, undefined, "all");
    expect(secondPage.items.length).toBe(1);
    expect(secondPage.items[0].publicId).not.toBe(firstPage.items[0].publicId);

    // Condition filter: no order is "pending" after createOrder, so total is 0.
    const pending = await listOrdersPage(cEq("status", "pending"), { page: 0, size: 10 }, undefined, "all");
    expect(pending.total).toBe(0);
    expect(pending.items.length).toBe(0);

    // Search facet: fullName filter (was covered by the now-removed listOrders() test).
    const byName = await listOrdersPage(cEq("fullName", "Jane Customer"), { page: 0, size: 10 }, undefined, "all");
    expect(byName.items.map((r) => r.fullName)).toEqual(["Jane Customer"]);
  });

  it("listOrdersPage scopes by organization visibility (resolveSessionVisibleOrgIds)", async () => {
    const snap = await loadCatalogSnapshot();
    const suffix = Math.random().toString(36).slice(2);
    const [orgA] = await db
      .insert(organization)
      .values({ name: "Org A", clientCode: `A-${suffix}` })
      .returning({ id: organization.id });
    const [orgB] = await db
      .insert(organization)
      .values({ name: "Org B", clientCode: `B-${suffix}` })
      .returning({ id: organization.id });

    const { publicId: orderAId } = await createOrder(
      baseInput(snap.mealSizes[0].publicId, snap.plans[0].key, "Jane Customer", "+16475550111"),
    );
    const { publicId: orderBId } = await createOrder(
      baseInput(snap.mealSizes[0].publicId, snap.plans[0].key, "Bob Buyer", "+16475550222"),
    );
    await db.update(orders).set({ organizationId: orgA.id }).where(eq(orders.publicId, orderAId));
    await db.update(orders).set({ organizationId: orgB.id }).where(eq(orders.publicId, orderBId));

    const [staffUser] = await db
      .insert(users)
      .values({ name: "Staff", email: `staff${suffix}@test.invalid`, role: "member", status: "active" })
      .returning({ id: users.id, publicId: users.publicId });
    await db.insert(member).values({ organizationId: orgA.id, userId: staffUser.id, role: "member" });

    // Single-member-org session: sees only orgA's order.
    const scopedVisible = await resolveSessionVisibleOrgIds({ user: { id: staffUser.publicId, platformRole: null } });
    const scopedPage = await listOrdersPage(undefined, { page: 0, size: 10 }, undefined, scopedVisible);
    expect(scopedPage.items.map((r) => r.publicId)).toEqual([orderAId]);

    // super_admin session: sees all orders regardless of membership.
    const superVisible = await resolveSessionVisibleOrgIds({
      user: { id: staffUser.publicId, platformRole: "super_admin" },
    });
    const superPage = await listOrdersPage(undefined, { page: 0, size: 10 }, undefined, superVisible);
    expect(superPage.items.map((r) => r.publicId).sort()).toEqual([orderAId, orderBId].sort());

    // Zero-membership session: sees no orders, not the whole table.
    const [noMemberUser] = await db
      .insert(users)
      .values({ name: "No Org Staff", email: `nomember${suffix}@test.invalid`, role: "member", status: "active" })
      .returning({ id: users.id, publicId: users.publicId });
    const noneVisible = await resolveSessionVisibleOrgIds({ user: { id: noMemberUser.publicId, platformRole: null } });
    const nonePage = await listOrdersPage(undefined, { page: 0, size: 10 }, undefined, noneVisible);
    expect(nonePage.items.length).toBe(0);
    expect(nonePage.total).toBe(0);
  });

  it("readOrder returns detail with plan/payment info", async () => {
    const snap = await loadCatalogSnapshot();
    const { publicId } = await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key));
    const detail = await readOrder(publicId, "all");
    expect(detail.publicId).toBe(publicId);
    expect(detail.planName).toBeTruthy();
    expect(detail.payments.length).toBeGreaterThan(0);
  });

  it("readOrder scopes by organization visibility, failing closed like a 404", async () => {
    const snap = await loadCatalogSnapshot();
    const suffix = Math.random().toString(36).slice(2);
    const [orgA] = await db
      .insert(organization)
      .values({ name: "Org A", clientCode: `RA-${suffix}` })
      .returning({ id: organization.id });
    const [orgB] = await db
      .insert(organization)
      .values({ name: "Org B", clientCode: `RB-${suffix}` })
      .returning({ id: organization.id });
    const { publicId } = await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key));
    await db.update(orders).set({ organizationId: orgA.id }).where(eq(orders.publicId, publicId));

    await expect(readOrder(publicId, [orgB.id])).rejects.toThrow(/not found/i);
    const detail = await readOrder(publicId, [orgA.id]);
    expect(detail.publicId).toBe(publicId);
    const allDetail = await readOrder(publicId, "all");
    expect(allDetail.publicId).toBe(publicId);
  });

  it("delivery and payment guards follow the row's own order", async () => {
    const snap = await loadCatalogSnapshot();
    const suffix = Math.random().toString(36).slice(2);
    const [orgA] = await db.insert(organization).values({ name: "Org A", clientCode: `GA-${suffix}` }).returning({ id: organization.id });
    const { publicId } = await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key));
    const [order] = await db.update(orders).set({ organizationId: orgA.id }).where(eq(orders.publicId, publicId)).returning({ id: orders.id });
    const [delivery] = await db.insert(schema.deliveries)
      .values({ orderId: order.id, deliveryDate: "2031-06-02", cutoffAt: 1, tiffinUnits: 1 }).returning({ publicId: schema.deliveries.publicId });
    const [payment] = await db.insert(schema.payments)
      .values({ orderId: order.id, amount: "1.00", method: "simulated", status: "paid" }).returning({ publicId: schema.payments.publicId });

    for (const [guard, id] of [[assertDeliveryVisible, delivery.publicId], [assertPaymentVisible, payment.publicId]] as const) {
      await expect(guard(id, ["org_someone_else"])).rejects.toThrow(/not found/i);
      await expect(guard(id, [])).rejects.toThrow(/not found/i);
      await expect(guard("missing", "all")).rejects.toThrow(/not found/i);
      await expect(guard(id, [orgA.id])).resolves.toBeUndefined();
      await expect(guard(id, "all")).resolves.toBeUndefined();
    }
  });
  describe("analytics revamp: shared where + refund ledger", () => {
    const mk = (name: string, phone: string) =>
      loadCatalogSnapshot().then((snap) => createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key, name, phone)));
    const ids = async (cond: Parameters<typeof ordersListWhere>[0], visible: "all" | string[] = "all") =>
      (await db.select({ p: orders.publicId }).from(orders).where(ordersListWhere(cond, visible))).map((r) => r.p).sort();

    it("ordersListWhere matches listOrdersPage for an existing condition", async () => {
      const a = await mk("Jane Customer", "+16475551001");
      await mk("Bob Buyer", "+16475551002");
      await db.update(orders).set({ status: "cancelled" }).where(eq(orders.publicId, a.publicId));
      const cond = cEq("status", "cancelled");
      const page = await listOrdersPage(cond, { page: 0, size: 10 }, undefined, "all");
      expect(await ids(cond)).toEqual(page.items.map((r) => r.publicId).sort());
      expect(page.total).toBe(1);
    });

    it("mealSize, zone and org facets narrow, and visible still caps them", async () => {
      const snap = await loadCatalogSnapshot();
      const a = await mk("Jane Customer", "+16475551003");
      const b = await mk("Bob Buyer", "+16475551004");
      const size = snap.mealSizes[0];
      expect(await ids(cEq("mealSize", size.key))).toEqual([a.publicId, b.publicId].sort());
      expect(await ids(cEq("mealSize", "no-such-size"))).toEqual([]);

      const suffix = Math.random().toString(36).slice(2);
      const [zone] = await db.insert(schema.deliveryZones).values({ name: `Zone ${suffix}`, postalPrefixes: ["ZZZ"] }).returning({ id: schema.deliveryZones.id, name: schema.deliveryZones.name });
      await db.update(orders).set({ zoneId: zone.id }).where(eq(orders.publicId, a.publicId));
      try {
        expect(await ids(cEq("zone", zone.name))).toEqual([a.publicId]);

        const [org] = await db.insert(organization).values({ name: "Org F", clientCode: `F-${suffix}` }).returning({ id: organization.id });
        try {
          await db.update(orders).set({ organizationId: org.id }).where(eq(orders.publicId, b.publicId));
          expect(await ids(cEq("org", org.id))).toEqual([b.publicId]);
          // A facet naming another franchise cannot widen a scoped viewer.
          expect(await ids(cEq("org", org.id), ["not-visible"])).toEqual([]);
        } finally {
          await db.update(orders).set({ organizationId: null }).where(eq(orders.publicId, b.publicId));
          await db.delete(organization).where(eq(organization.id, org.id));
        }
      } finally {
        await db.update(orders).set({ zoneId: null }).where(eq(orders.publicId, a.publicId));
        await db.delete(schema.deliveryZones).where(eq(schema.deliveryZones.id, zone.id));
      }
    });

    const refundRows = (orderId: bigint) =>
      db.select().from(ledgerEntries).where(and(eq(ledgerEntries.orderId, orderId), eq(ledgerEntries.type, "refund")));
    const settle = async (publicId: string) => {
      const [o] = await db.select().from(orders).where(eq(orders.publicId, publicId));
      const [pay] = await db.update(payments).set({ status: "paid" }).where(eq(payments.orderId, o.id)).returning();
      return { o, pay };
    };

    it("refundOrder writes exactly one ledger refund row for the payment amount", async () => {
      const a = await mk("Jane Customer", "+16475551005");
      const { o, pay } = await settle(a.publicId);
      await refundOrder(a.publicId);
      const rows = await refundRows(o.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ direction: "debit", paymentId: pay.id, userId: o.userId });
      expect(Number(rows[0].amount)).toBe(Number(pay.amount));
    });
  });
});
