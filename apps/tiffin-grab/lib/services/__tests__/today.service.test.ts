import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";
import { zonedDateIso } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => null }));

const { db } = await import("@/db/client");
const {
  deliveries, deliveryFrequencies, inquiries, leadSources, mealSizes, orderActivities, orders, organization, payments, plans, ticketMessages, tickets, users,
} = await import("@/db/schema");
const { getAppSettings } = await import("../app-settings.service");
const { countMissedDeliveries } = await import("../missed-deliveries.service");
const { inquiriesService } = await import("../inquiries.service");
const { countPaymentReviewOrders } = await import("../orders.service");
const { PER_KIND_MIXED, countReviewPayments, coversAllOrgs, getTodayCounts, getTodayQueue } = await import("../today.service");

const suffix = Math.random().toString(36).slice(2);
const DAY = 864e5;
let orgA = "";
let orgB = "";
let today = "";
let n = 0;
const userIds: bigint[] = [];
const orderIds: bigint[] = [];
const ticketIds: bigint[] = [];
const inquiryIds: bigint[] = [];

const addDays = (iso: string, d: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + d * DAY).toISOString().slice(0, 10);

async function makeUser() {
  const k = n++;
  const [u] = await db.insert(users).values({ email: `today${k}-${suffix}@x.test`, name: `Today ${k}`, role: "user" }).returning();
  userIds.push(u!.id);
  return u!.id;
}

async function makeOrder(org: string, name: string, over: Partial<typeof orders.$inferInsert> = {}) {
  const [plan] = await db.select({ id: plans.id }).from(plans).orderBy(plans.id).limit(1);
  const [size] = await db.select({ id: mealSizes.id }).from(mealSizes).limit(1);
  const [freq] = await db.select({ id: deliveryFrequencies.id }).from(deliveryFrequencies).limit(1);
  const [o] = await db
    .insert(orders)
    .values({
      userId: await makeUser(), planId: plan!.id, mealSizeId: size!.id, frequencyId: freq!.id, durationWeeks: 1,
      startDate: "2035-01-01", tiffinCount: 5, perTiffinPrice: "10.00", pricingSnapshot: {}, total: "50.00",
      deploymentId: `TD-${suffix}-${n++}`, fullName: name, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6",
      organizationId: org, status: "active", ...over,
    })
    .returning();
  orderIds.push(o!.id);
  return o!;
}

const deliver = (orderId: bigint, deliveryDate: string) =>
  db.insert(deliveries).values({ orderId, deliveryDate, status: "scheduled", cutoffAt: Date.now() - DAY, tiffinUnits: 1 });

async function makeTicket(org: string, name: string, lastMessageAt: number, status: "open" | "resolved" = "open") {
  const raisedBy = await makeUser();
  const [t] = await db
    .insert(tickets)
    .values({ raisedBy, subject: `Subject ${name}`, category: "delivery", status, organizationId: org, createdAt: lastMessageAt })
    .returning();
  ticketIds.push(t!.id);
  await db.insert(ticketMessages).values({ ticketId: t!.id, authorId: raisedBy, authorType: "customer", body: "hi", createdAt: lastMessageAt, organizationId: org });
  await db.update(users).set({ name }).where(inArray(users.id, [raisedBy]));
  return t!;
}

describe("today queue (integration)", () => {
  let sourceId = 0n;

  beforeAll(async () => {
    [{ id: orgA }] = await db.insert(organization).values({ name: "Today A", clientCode: `TA-${suffix}` }).returning({ id: organization.id });
    [{ id: orgB }] = await db.insert(organization).values({ name: "Today B", clientCode: `TB-${suffix}` }).returning({ id: organization.id });
    today = zonedDateIso(Date.now(), (await getAppSettings()).timezone);

    let [source] = await db.select({ id: leadSources.id }).from(leadSources).limit(1);
    source ??= (await db.insert(leadSources).values({ key: `src-${suffix}`, label: "Src" }).returning({ id: leadSources.id }))[0]!;
    sourceId = source.id;

    for (const [org, tag] of [[orgA, "A"], [orgB, "B"]] as const) {
      // Renewals: last tiffin in 2 days (listed) and in 3 days (not yet).
      await deliver((await makeOrder(org, `${tag} renew2`)).id, addDays(today, 2));
      await deliver((await makeOrder(org, `${tag} renew3`)).id, addDays(today, 3));
      // A past day nobody confirmed.
      const missed = await makeOrder(org, `${tag} missed`);
      await deliver(missed.id, addDays(today, -3));
      await deliver(missed.id, addDays(today, 30));
      // Look out for.
      await makeOrder(org, `${tag} lookout`, { lookOutAt: Date.now() - 2 * DAY, lookOutNote: `${tag} watch this one` });
      // Payments: one reviewable payment on org B, two on the same order for org A.
      const paying = await makeOrder(org, `${tag} pay`, { status: "pending" });
      await db.insert(payments).values({ orderId: paying.id, amount: "50.00", method: "etransfer", status: "pending_verification", reference: "REF1", organizationId: org });
      if (tag === "A") await db.insert(payments).values({ orderId: paying.id, amount: "20.00", method: "etransfer", status: "awaiting_payment", organizationId: org });

      // Tickets: overdue (last message 3 days ago), new, and a resolved one that must not show.
      await makeTicket(org, `${tag} overdue`, Date.now() - 3 * DAY);
      await makeTicket(org, `${tag} fresh`, Date.now() - 60_000);
      await makeTicket(org, `${tag} done`, Date.now() - 3 * DAY, "resolved");

      for (const stage of ["new", "converted"] as const) {
        const [i] = await db
          .insert(inquiries)
          .values({ fullName: `${tag} lead ${stage}`, phone: `+1647555${String(7000 + n++)}`, sourceId, organizationId: org, stage })
          .returning({ id: inquiries.id });
        inquiryIds.push(i!.id);
      }
    }
  });

  afterAll(async () => {
    if (ticketIds.length) {
      await db.delete(ticketMessages).where(inArray(ticketMessages.ticketId, ticketIds));
      await db.delete(tickets).where(inArray(tickets.id, ticketIds));
    }
    if (inquiryIds.length) await db.delete(inquiries).where(inArray(inquiries.id, inquiryIds));
    if (orderIds.length) {
      await db.delete(payments).where(inArray(payments.orderId, orderIds));
      await db.delete(orderActivities).where(inArray(orderActivities.orderId, orderIds));
      await db.delete(deliveries).where(inArray(deliveries.orderId, orderIds));
      await db.delete(orders).where(inArray(orders.id, orderIds));
    }
    await db.delete(users).where(inArray(users.id, userIds));
    await db.delete(organization).where(inArray(organization.id, [orgA, orgB]));
  });

  it("maps every source to a row with its kind, urgency and link, other franchises left out", async () => {
    const { items, failed } = await getTodayQueue([orgA], Date.now());
    expect(failed).toEqual([]);

    const by = (kind: string) => items.filter((i) => i.kind === kind);
    expect(by("missed")).toMatchObject([{ who: "A missed", urgency: 1, href: expect.stringMatching(/^\/dashboard\/orders\/ord_/) }]);
    expect(by("renewal")).toMatchObject([{ who: "A renew2", urgency: 2, href: "/dashboard/renewals?ending=2" }]);
    expect(by("lookout")).toMatchObject([{ who: "A lookout", what: "A watch this one", urgency: 3 }]);
    expect(by("inquiry")).toMatchObject([{ who: "A lead new", urgency: 3, href: expect.stringMatching(/^\/dashboard\/inquiries\//) }]);

    const tix = by("ticket");
    expect(tix.map((t) => [t.who, t.urgency])).toEqual(expect.arrayContaining([["A overdue", 1], ["A fresh", 3]]));
    expect(tix).toHaveLength(2);
    expect(tix[0]!.href).toMatch(/^\/dashboard\/tickets\//);

    // Both payments on the one order are rows of their own.
    const pays = by("payment");
    expect(pays).toHaveLength(2);
    expect(pays.every((p) => p.urgency === 2 && p.kind === "payment")).toBe(true);
    expect(pays.filter((p) => p.kind === "payment" && p.canVerify)).toHaveLength(2);

    expect(items.every((i) => !i.who.startsWith("B "))).toBe(true);
    expect(items.map((i) => i.urgency)).toEqual([...items.map((i) => i.urgency)].sort());
  });

  it("excludes a renewal ending in 3 days and a resolved ticket", async () => {
    const { items } = await getTodayQueue([orgA], Date.now());
    expect(items.some((i) => i.who === "A renew3" || i.who === "A done")).toBe(false);
  });

  it("an empty scope returns nothing", async () => {
    expect(await getTodayQueue([], Date.now())).toEqual({ items: [], failed: [] });
    expect((await getTodayCounts([], today)).byKind).toEqual({ payment: 0, missed: 0, ticket: 0, renewal: 0, lookout: 0, inquiry: 0 });
  });

  it("totals equal the functions they come from", async () => {
    const c = await getTodayCounts([orgA], today);
    expect(c.byKind.payment).toBe(await countReviewPayments([orgA]));
    expect(c.byKind.payment).toBe(2);
    expect(c.toVerify).toBe(await countPaymentReviewOrders([orgA]));
    expect(c.toVerify).toBe(1);
    expect(c.missed).toBe(await countMissedDeliveries([orgA]));
    expect(c.byKind.inquiry).toBe(await inquiriesService.countNew([orgA]));
    expect(c.byKind.inquiry).toBe(1);
    expect(c.byKind).toMatchObject({ ticket: 2, renewal: 1, lookout: 1 });
    expect([c.openTickets, c.overdueTickets]).toEqual([2, 1]);
  });

  it("a type filter fetches only that kind", async () => {
    const { items } = await getTodayQueue([orgA], Date.now(), ["inquiry"]);
    expect(items.map((i) => i.kind)).toEqual(["inquiry"]);
  });

  it("returns 50 rows when more are waiting, with the total still exact", async () => {
    const rows = Array.from({ length: 52 }, (_, k) => ({ fullName: `B bulk ${k}`, phone: `+1647555${String(9000 + k)}`, sourceId, organizationId: orgB, stage: "new" as const }));
    const made = await db.insert(inquiries).values(rows).returning({ id: inquiries.id });
    inquiryIds.push(...made.map((m) => m.id));

    const { items } = await getTodayQueue([orgB], Date.now(), ["inquiry"]);
    expect(items).toHaveLength(50);
    expect((await getTodayCounts([orgB], today)).byKind.inquiry).toBe(53);

    // Mixed view (every type): a large backlog of one type is capped so the others still show.
    const mixed = await getTodayQueue([orgB], Date.now());
    expect(mixed.items.filter((i) => i.kind === "inquiry")).toHaveLength(PER_KIND_MIXED);
  });

  it("covers every franchise only when the user sees all of them", async () => {
    expect(await coversAllOrgs("all")).toBe(true);
    expect(await coversAllOrgs([])).toBe(false);
    expect(await coversAllOrgs([orgB])).toBe(false);
  });
});
