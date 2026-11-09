import { afterAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, like, ne } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";

const session: { user: { id: string; role: string } | null } = { user: null };
vi.mock("@/lib/auth/session", () => ({ getSession: async () => (session.user ? session : null) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/payments/stripe", async (orig) => ({
  ...(await orig<object>()),
  stripeRuntime: async () => ({ stripe: {}, cfg: { surcharge: { enabled: false, ratePct: 0, excludeProvinces: [], networksNotifiedOn: "2026-09-01" }, tax: { enabled: false, taxCode: "txcd_x", surchargeTaxable: false } } }),
}));

const { db } = await import("@/db/client");
const { coinRate, deliveries, inquiries, inquiryActivities, ledgerEntries, menuWeeks, notificationOutbox, notifications, notificationPrefs, orderActivities, orders, payments, ticketMessages, tickets, users, walletLedger } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { makeTripOrder } = await import("./trip-fixture");
const { maybeComplete } = await import("../deliveries.service");
const { ordersService } = await import("../orders.service");
const { createOrder } = await import("../create-order");
const { menuService } = await import("../menu.service");
const { ticketsService } = await import("../tickets.service");
const { inquiriesService } = await import("../inquiries.service");
const { refundOrder } = await import("@/lib/payments/verification");
const { recordStripeRefund } = await import("../payment-stripe");
const { deleteMyAccount } = await import("@/lib/account/account-actions");
const { ensureSystemUser } = await import("@/db/test-helpers");

const R = Math.random().toString(36).slice(2, 8);
const userIds: bigint[] = [];
const rand = () => Math.random().toString(36).slice(2);
const phoneNo = () => `+1647555${String(Math.floor(Math.random() * 9000) + 1000)}`;

const rowsFor = async (event: string, recipientId: bigint) =>
  db.select().from(notificationOutbox).where(and(eq(notificationOutbox.event, event as never), eq(notificationOutbox.recipientId, recipientId)));
const channelsOf = (rows: { channel: string }[]) => rows.map((r) => r.channel).sort();

async function seedUser(name: string, role: "user" | "member" | "admin", email = `ns${rand()}@test.invalid`) {
  const [u] = await db.insert(users).values({ email, name, role }).returning({ id: users.id, publicId: users.publicId, email: users.email });
  userIds.push(u.id);
  return u;
}

afterAll(async () => {
  const mine = await db.select({ id: users.id }).from(users).where(like(users.email, "ns%@test.invalid"));
  const ids = [...new Set([...userIds, ...mine.map((m) => m.id)])];
  await db.delete(ticketMessages);
  await db.delete(tickets);
  await db.delete(inquiryActivities);
  await db.delete(inquiries);
  await db.delete(menuWeeks).where(eq(menuWeeks.weekStart, "2099-12-07"));
  if (ids.length) {
    const mineOrders = db.select({ id: orders.id }).from(orders).where(inArray(orders.userId, ids));
    await db.delete(ledgerEntries).where(inArray(ledgerEntries.orderId, mineOrders));
    await db.delete(walletLedger).where(inArray(walletLedger.userId, ids));
    await db.delete(notificationOutbox).where(inArray(notificationOutbox.recipientId, ids));
    await db.delete(notifications).where(inArray(notifications.userId, ids));
    await db.delete(notificationPrefs).where(inArray(notificationPrefs.userId, ids));
  }
  if (ids.length) {
    const left = await db.select({ id: orders.id }).from(orders).where(inArray(orders.userId, ids));
    const orderIdList = left.map((o) => o.id);
    if (orderIdList.length) {
      await db.update(deliveries).set({ makeupForDeliveryId: null, mergedIntoDeliveryId: null, complimentaryForDeliveryId: null, holidayExtraForDeliveryId: null, holidayId: null }).where(inArray(deliveries.orderId, orderIdList));
      await db.delete(orderActivities).where(inArray(orderActivities.orderId, orderIdList));
      await db.delete(deliveries).where(inArray(deliveries.orderId, orderIdList));
      await db.delete(ledgerEntries).where(inArray(ledgerEntries.orderId, orderIdList));
      await db.delete(payments).where(inArray(payments.orderId, orderIdList));
      await db.delete(orders).where(inArray(orders.id, orderIdList));
    }
    await db.delete(users).where(inArray(users.id, ids));
  }
});

describe("order sends", () => {
  it("order_completed: email + in_app once per order", async () => {
    const { order } = await makeTripOrder(`ns-${R}-a`, "nsa");
    await db.update(deliveries).set({ status: "cancelled" }).where(eq(deliveries.orderId, order.id));
    expect(await maybeComplete(order.id)).toBe(true);
    expect(channelsOf(await rowsFor("order_completed", order.userId!))).toEqual(["email", "in_app"]);
    await db.update(orders).set({ status: "active" }).where(eq(orders.id, order.id));
    await maybeComplete(order.id);
    expect(await rowsFor("order_completed", order.userId!)).toHaveLength(2);
  });

  it("order_cancelled: email + in_app once per order", async () => {
    const { order } = await makeTripOrder(`ns-${R}-b`, "nsb");
    await ordersService.cancel(order.publicId);
    expect(channelsOf(await rowsFor("order_cancelled", order.userId!))).toEqual(["email", "in_app"]);
    await db.update(orders).set({ status: "active" }).where(eq(orders.id, order.id));
    await ordersService.cancel(order.publicId);
    expect(await rowsFor("order_cancelled", order.userId!)).toHaveLength(2);
  });

  it("refund_issued: full refund and Stripe partial refund each send once", async () => {
    const { order } = await makeTripOrder(`ns-${R}-c`, "nsc");
    await refundOrder(order.publicId);
    expect(channelsOf(await rowsFor("refund_issued", order.userId!))).toEqual(["email", "in_app"]);
    await db.update(payments).set({ status: "paid" }).where(eq(payments.orderId, order.id));
    await refundOrder(order.publicId);
    expect(await rowsFor("refund_issued", order.userId!)).toHaveLength(2);

    const { order: stripeOrder } = await makeTripOrder(`ns-${R}-d`, "nsd");
    const pi = `pi_ns_${R}`;
    await db.update(payments).set({ method: "stripe", providerRef: pi }).where(eq(payments.orderId, stripeOrder.id));
    const partial = { piId: pi, eventId: `evt-${R}-1`, amountRefundedCents: 2000, fullyRefunded: false };
    await recordStripeRefund(partial);
    expect(channelsOf(await rowsFor("refund_issued", stripeOrder.userId!))).toEqual(["email", "in_app"]);
    await recordStripeRefund(partial);
    expect(await rowsFor("refund_issued", stripeOrder.userId!)).toHaveLength(2);
  });

  it("wallet_redeemed: sent when coins are committed with the order, once", async () => {
    const snap = await loadCatalogSnapshot();
    const phone = phoneNo();
    const input = (start: string, email: string) => ({
      planKey: snap.plans[0].key,
      selections: { mealSizeId: snap.mealSizes[0].publicId, frequencyKey: "5_day" as const, persons: 1, mealSlots: ["lunch"], includeSaturday: false, includeSunday: false, durationWeeks: 1, startDate: start },
      contact: { email, fullName: "Coin Spender", phone, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
    });
    const email = `ns${rand()}@test.invalid`;
    const first = nextWeekday(new Date());
    await createOrder(input(first.toISOString().slice(0, 10), email));
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    userIds.push(u.id);
    await db.insert(coinRate).values({ currency: "CAD", valuePerCoin: "0.2500" });
    await db.insert(walletLedger).values({ userId: u.id, direction: "credit", eventType: "order_activated", sourceType: "seed", sourceId: `ns-${R}`, coins: 200 });
    const second = new Date(first);
    second.setUTCDate(second.getUTCDate() + 7);
    const { publicId } = await createOrder({ ...input(second.toISOString().slice(0, 10), email), coins: 40 });
    const rows = await rowsFor("wallet_redeemed", u.id);
    expect(channelsOf(rows)).toEqual(["email", "in_app"]);
    expect(rows.every((r) => r.dedupeKey?.startsWith(`wallet_redeemed:${publicId}`))).toBe(true);
    await db.delete(coinRate).where(eq(coinRate.currency, "CAD"));
  });
});

describe("menu_released", () => {
  it("fans out to running-plan customers, skips marketing opt-outs, and never repeats", async () => {
    const { order: a } = await makeTripOrder(`ns-${R}-e`, "nse");
    const { order: b } = await makeTripOrder(`ns-${R}-f`, "nsf");
    await db.insert(notificationPrefs).values({ userId: b.userId!, channel: "email", kind: "marketing", enabled: false });
    const week = await menuService.upsertWeek({ weekStart: "2099-12-07" });
    await menuService.markReady(week.publicId);
    await menuService.release(week.publicId);
    const sent = await rowsFor("menu_released", a.userId!);
    expect(channelsOf(sent)).toEqual(["email", "in_app"]);
    expect(sent.every((r) => r.kind === "marketing" && r.dedupeKey?.startsWith(`menu_released:${week.publicId}:${a.userId}`))).toBe(true);
    expect(channelsOf(await rowsFor("menu_released", b.userId!))).toEqual(["in_app"]);
    await db.update(menuWeeks).set({ status: "ready" }).where(eq(menuWeeks.publicId, week.publicId));
    await menuService.release(week.publicId);
    expect(await rowsFor("menu_released", a.userId!)).toHaveLength(2);
  });
});

describe("ticket sends", () => {
  it("created, reply (both directions) and resolved", async () => {
    const customer = await seedUser("Cust", "user");
    const staff = await seedUser("Staff", "admin");
    session.user = { id: customer.publicId, role: "user" };
    const ticket = await ticketsService.create({ subject: "Late", category: "order", subcategory: "order_missing", body: "Where is it?" });
    const created = await db.select().from(notificationOutbox).where(like(notificationOutbox.dedupeKey, `ticket_created:${ticket.publicId}%`));
    expect(created.length).toBeGreaterThan(0);
    expect(created.every((r) => r.channel === "in_app" && r.event === "ticket_created")).toBe(true);

    await ticketsService.reply(ticket.publicId, "Hello?");
    const staffSide = await db.select().from(notificationOutbox).where(and(eq(notificationOutbox.event, "ticket_reply"), ne(notificationOutbox.recipientId, customer.id)));
    expect(staffSide.length).toBeGreaterThan(0);
    expect(staffSide.every((r) => r.channel === "in_app")).toBe(true);
    expect(await rowsFor("ticket_reply", customer.id)).toHaveLength(0);

    session.user = { id: staff.publicId, role: "admin" };
    await ticketsService.reply(ticket.publicId, "On it");
    expect(channelsOf(await rowsFor("ticket_reply", customer.id))).toEqual(["email", "in_app"]);

    await ticketsService.changeStatus(ticket.publicId, "in_progress");
    expect(await rowsFor("ticket_resolved", customer.id)).toHaveLength(0);
    await ticketsService.changeStatus(ticket.publicId, "resolved");
    await ticketsService.changeStatus(ticket.publicId, "resolved");
    expect(channelsOf(await rowsFor("ticket_resolved", customer.id))).toEqual(["email", "in_app"]);
    session.user = null;
  });
});

describe("inquiry sends", () => {
  it("created sends once and a fold sends nothing; follow-up keyed by date; convert sends to owner and customer", async () => {
    await ensureSystemUser();
    const staff = await seedUser("Agent", "member");
    session.user = { id: staff.publicId, role: "member" };
    const phone = phoneNo();
    const email = `ns${rand()}@test.invalid`;
    const inq = await inquiriesService.create({ fullName: "Lead Z", phone, sourceKey: "manual", email });
    const byKey = (event: string) => db.select().from(notificationOutbox).where(and(eq(notificationOutbox.event, event as never), like(notificationOutbox.dedupeKey, `${event}:${inq.publicId}%`)));
    const created = await byKey("inquiry_created");
    expect(created.length).toBeGreaterThan(0);
    expect(created.every((r) => r.channel === "in_app")).toBe(true);

    const folded = await inquiriesService.createOrFold({ fullName: "Lead Z", phone, sourceKey: "manual", email });
    expect(folded.folded).toBe(true);
    expect(await byKey("inquiry_created")).toHaveLength(created.length);

    await inquiriesService.addNote(inq.publicId, "no date");
    expect(await byKey("inquiry_follow_up")).toHaveLength(0);
    const at = Date.parse("2099-01-05T15:00:00Z");
    await inquiriesService.addNote(inq.publicId, "call back", at);
    const followUps = await byKey("inquiry_follow_up");
    expect(followUps.length).toBeGreaterThan(0);
    expect(followUps.every((r) => r.dedupeKey!.includes(":2099-01-05"))).toBe(true);
    await inquiriesService.addNote(inq.publicId, "again", at + 3600_000);
    expect(await byKey("inquiry_follow_up")).toHaveLength(followUps.length);

    const snap = await loadCatalogSnapshot();
    const customerEmail = `ns${rand()}@test.invalid`;
    const { deploymentId } = await inquiriesService.convert(inq.publicId, {
      planKey: snap.plans[0].key,
      selections: { mealSizeId: snap.mealSizes[0].publicId, frequencyKey: "5_day", persons: 1, mealSlots: ["lunch"], includeSaturday: false, includeSunday: false, durationWeeks: 1, startDate: nextWeekday(new Date()).toISOString().slice(0, 10) },
      contact: { email: customerEmail, fullName: "Lead Z", phone, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
    });
    const converted = await byKey("inquiry_converted");
    expect(converted.filter((r) => r.dedupeKey!.includes(":staff")).every((r) => r.channel === "in_app")).toBe(true);
    const [order] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    userIds.push(order.userId!);
    expect(channelsOf(converted.filter((r) => r.recipientId === order.userId))).toEqual(["email", "in_app"]);
    session.user = null;
  });
});

describe("account_deletion_confirm", () => {
  it("emails the address the customer had, even though deletion anonymizes it", async () => {
    const email = `ns${rand()}@test.invalid`;
    const me = await seedUser("Leaver", "user", email);
    session.user = { id: me.publicId, role: "user" };
    const { usersService } = await import("../users.service");
    vi.spyOn(usersService, "verifyAccountPassword").mockResolvedValue(true);
    expect(await deleteMyAccount({ password: "x" })).toEqual({});
    const [after] = await db.select({ email: users.email, status: users.status }).from(users).where(eq(users.id, me.id));
    expect(after.status).toBe("deleted");
    expect(after.email).not.toBe(email);
    const rows = await rowsFor("account_deletion_confirm", me.id);
    expect(channelsOf(rows)).toEqual(["email"]);
    expect(rows[0].recipientEmail).toBe(email);
    session.user = null;
  });
});
