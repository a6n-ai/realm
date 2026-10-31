import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, gte, inArray, lte } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => null }));

const { db } = await import("@/db/client");
const {
  couponRedemptions, coupons, deliveries, deliveryFrequencies, inquiries, leadSources, mealSizes, notificationOutbox,
  orderActivities, orders, organization, plans, tickets, users,
} = await import("@/db/schema");
const { buildAnalyticsScope } = await import("../metrics/scope");
const { getLeadStats, getLeadsByStage } = await import("../leads.service");
const { getEmployeeRollup } = await import("../employees.service");
const { getDeliveriesDaily, getOperationsStats } = await import("../operations.service");
const { getNotificationBuckets } = await import("../notifications.service");

const TZ = "America/Toronto";
const now = Date.now();
const suffix = Math.random().toString(36).slice(2);
const scopeFor = (orgIds: "all" | string[], over: Record<string, string> = {}) =>
  buildAnalyticsScope({ from: String(now - 86_400_000), to: String(now + 86_400_000), ...over }, orgIds, TZ, now);

let orgA = "";
let orgB = "";
let staffId = 0n;
const userIds: bigint[] = [];
const orderIds: bigint[] = [];
const inquiryIds: bigint[] = [];
const ticketIds: bigint[] = [];
const couponIds: bigint[] = [];
let n = 0;

async function makeUser(role: "user" | "admin" = "user") {
  const k = n++;
  const [u] = await db.insert(users).values({ email: `st${k}-${suffix}@x.test`, name: `St ${k}`, role }).returning();
  userIds.push(u!.id);
  return u!.id;
}

async function makeOrder(org: string, planKeyIdx = 0) {
  const planRows = await db.select({ id: plans.id }).from(plans).orderBy(plans.id);
  const [size] = await db.select({ id: mealSizes.id }).from(mealSizes).limit(1);
  const [freq] = await db.select({ id: deliveryFrequencies.id }).from(deliveryFrequencies).limit(1);
  const [o] = await db
    .insert(orders)
    .values({
      userId: await makeUser(),
      planId: planRows[Math.min(planKeyIdx, planRows.length - 1)]!.id,
      mealSizeId: size!.id,
      frequencyId: freq!.id,
      durationWeeks: 1,
      startDate: "2035-01-01",
      tiffinCount: 5,
      perTiffinPrice: "10.00",
      pricingSnapshot: {},
      total: "50.00",
      deploymentId: `SC-${suffix}-${n++}`,
      fullName: "Fixture",
      addressLine: "1 St",
      city: "Toronto",
      postalCode: "M5V 2T6",
      organizationId: org,
    })
    .returning();
  orderIds.push(o!.id);
  return o!;
}

describe("franchise-scoped analytics tabs (integration)", () => {
  beforeAll(async () => {
    [{ id: orgA }] = await db.insert(organization).values({ name: "Scoped A", clientCode: `SA-${suffix}` }).returning({ id: organization.id });
    [{ id: orgB }] = await db.insert(organization).values({ name: "Scoped B", clientCode: `SB-${suffix}` }).returning({ id: organization.id });
    staffId = await makeUser("admin");
  });

  afterAll(async () => {
    if (couponIds.length) {
      await db.delete(couponRedemptions).where(inArray(couponRedemptions.couponId, couponIds));
      await db.delete(coupons).where(inArray(coupons.id, couponIds));
    }
    if (ticketIds.length) await db.delete(tickets).where(inArray(tickets.id, ticketIds));
    if (inquiryIds.length) await db.delete(inquiries).where(inArray(inquiries.id, inquiryIds));
    if (orderIds.length) {
      await db.delete(orderActivities).where(inArray(orderActivities.orderId, orderIds));
      await db.delete(deliveries).where(inArray(deliveries.orderId, orderIds));
      await db.delete(orders).where(inArray(orders.id, orderIds));
    }
    await db.delete(users).where(inArray(users.id, userIds));
    await db.delete(organization).where(inArray(organization.id, [orgA, orgB]));
  });

  it("scopes leads by the inquiry's own franchise; unstamped leads appear under All only", async () => {
    let [source] = await db.select({ id: leadSources.id }).from(leadSources).limit(1);
    source ??= (await db.insert(leadSources).values({ key: `src-${suffix}`, label: "Src" }).returning({ id: leadSources.id }))[0]!;
    const mk = async (org: string | null, stage: "new" | "converted") => {
      const k = n++;
      const [i] = await db
        .insert(inquiries)
        .values({ fullName: `Lead ${k}`, phone: `+1647555${String(8000 + k)}`, sourceId: source!.id, organizationId: org, stage, currentOwner: staffId })
        .returning({ id: inquiries.id });
      inquiryIds.push(i!.id);
    };
    await mk(orgA, "new");
    await mk(orgA, "converted");
    await mk(orgB, "new");
    await mk(null, "new");

    const total = async (orgIds: "all" | string[]) => (await getLeadStats(scopeFor(orgIds))).total;
    const base = await total("all");
    expect(await total([orgA])).toBe(2);
    expect(await total([orgB])).toBe(1);
    expect(await total([orgA, orgB])).toBe(3);
    expect(base).toBeGreaterThanOrEqual(4);
    expect(await total([])).toBe(0);
    expect((await getLeadStats(scopeFor([orgA]))).converted).toBe(1);
    expect((await getLeadsByStage(scopeFor([orgA]))).reduce((s, r) => s + r.n, 0)).toBe(2);
  });

  it("scopes deliveries through the order's franchise", async () => {
    const a = await makeOrder(orgA);
    const b = await makeOrder(orgB);
    const day = (offset: number) => new Date(now + offset * 86_400_000).toISOString().slice(0, 10);
    for (const [o, status, date] of [[a, "scheduled", day(0)], [a, "skipped", day(1)], [b, "scheduled", day(0)]] as const) {
      await db.insert(deliveries).values({ orderId: o.id, deliveryDate: date, status, cutoffAt: now, tiffinUnits: 1 });
    }
    expect(await getOperationsStats(scopeFor([orgA]))).toMatchObject({ totalDeliveries: 2, skipped: 1 });
    expect((await getOperationsStats(scopeFor([orgB]))).totalDeliveries).toBe(1);
    expect((await getOperationsStats(scopeFor([]))).totalDeliveries).toBe(0);

    const sum = (rows: Awaited<ReturnType<typeof getDeliveriesDaily>>, k: "scheduled" | "paused" | "skipped" | "cancelled") =>
      rows.reduce((t, r) => t + r[k], 0);
    for (const orgIds of [[orgA], [orgB], []] as string[][]) {
      const stats = await getOperationsStats(scopeFor(orgIds));
      const rows = await getDeliveriesDaily(scopeFor(orgIds));
      const total = sum(rows, "scheduled") + sum(rows, "paused") + sum(rows, "skipped") + sum(rows, "cancelled");
      expect(total).toBe(stats.totalDeliveries);
      expect(sum(rows, "skipped")).toBe(stats.skipped);
      expect(sum(rows, "cancelled")).toBe(stats.cancelled);
    }
  });

  it("applies franchise and plan facets to a rep's tickets and coupons, and dates tickets by resolution", async () => {
    const planRows = await db.select({ key: plans.key }).from(plans).orderBy(plans.id);
    const orderA = await makeOrder(orgA, 0);
    const orderB = await makeOrder(orgB, 0);
    const raisedBy = await makeUser();
    const day = 86_400_000;
    const mkTicket = async (over: { orderId: bigint | null; closedAt: number; createdAt?: number }) => {
      const [t] = await db
        .insert(tickets)
        .values({
          raisedBy, subject: "t", category: "order", status: "resolved", currentOwner: staffId,
          orderId: over.orderId, closedAt: over.closedAt, createdAt: over.createdAt ?? now,
        })
        .returning({ id: tickets.id });
      ticketIds.push(t!.id);
    };
    await mkTicket({ orderId: orderA.id, closedAt: now });
    await mkTicket({ orderId: orderB.id, closedAt: now });
    await mkTicket({ orderId: null, closedAt: now });
    // Raised long ago, resolved today: counts today. Raised today, resolved a month ago: does not.
    await mkTicket({ orderId: orderA.id, closedAt: now, createdAt: now - 60 * day });
    await mkTicket({ orderId: orderA.id, closedAt: now - 30 * day });

    const mkCoupon = async (org: string | null, redeemedOn?: typeof orderA) => {
      const k = n++;
      const [c] = await db
        .insert(coupons)
        .values({ code: `REP-${suffix}-${k}`, kind: "rep_code", name: "rep", ownerUserId: staffId, organizationId: org })
        .returning({ id: coupons.id });
      couponIds.push(c!.id);
      if (redeemedOn) {
        await db.insert(couponRedemptions).values({ couponId: c!.id, userId: redeemedOn.userId!, orderId: redeemedOn.id, amountApplied: "5.00" });
      }
    };
    await mkCoupon(orgA, orderA);
    await mkCoupon(orgB, orderB);
    await mkCoupon(null);

    const mine = async (scope: ReturnType<typeof scopeFor>) =>
      (await getEmployeeRollup(scope)).rows.find((r) => r.userId === String(staffId));

    const all = await mine(scopeFor("all"));
    expect(all?.ticketsResolved).toBe(4); // the four resolved today, linked or not
    expect(all?.repDailyCoupons).toBe(3);

    const a = await mine(scopeFor([orgA]));
    expect(a?.ticketsResolved).toBe(2); // order A's two; unlinked and other-franchise tickets drop out
    expect(a?.repDailyCoupons).toBe(1);

    // A plan facet no fixture order matches leaves nothing for tickets or coupons.
    const otherPlan = planRows.length > 1 ? planRows[1]!.key : "no-such-plan";
    const none = await mine(scopeFor("all", { plan: otherPlan === planRows[0]?.key ? "no-such-plan" : otherPlan }));
    expect(none?.ticketsResolved ?? 0).toBe(0);
    expect(none?.repDailyCoupons ?? 0).toBe(0);

    expect((await getEmployeeRollup(scopeFor([]))).rows).toEqual([]);
  });

  it("counts a rep's owned orders and logged actions inside the franchise scope only", async () => {
    const orderA = await makeOrder(orgA);
    const orderB = await makeOrder(orgB);
    await db.update(orders).set({ currentOwner: staffId }).where(inArray(orders.id, [orderA.id, orderB.id]));
    await db.insert(orderActivities).values([
      { orderId: orderA.id, type: "note", note: "a", createdBy: staffId, organizationId: orgA },
      { orderId: orderA.id, type: "note", note: "a2", createdBy: staffId, organizationId: orgA },
      { orderId: orderB.id, type: "note", note: "b", createdBy: staffId, organizationId: orgB },
    ]);
    const mine = async (orgIds: "all" | string[]) =>
      (await getEmployeeRollup(scopeFor(orgIds))).rows.find((r) => r.userId === String(staffId));
    expect(await mine([orgA])).toMatchObject({ ordersOwned: 1, actions: 2, renewalRatePct: 0 });
    expect(await mine([orgB])).toMatchObject({ ordersOwned: 1, actions: 1 });
    expect((await mine("all"))?.ordersOwned).toBeGreaterThanOrEqual(2);
  });

  it("lists only staff: a customer who logs order actions is not a rep", async () => {
    const order = await makeOrder(orgA);
    const customerId = await makeUser("user");
    await db.insert(orderActivities).values({ orderId: order.id, type: "note", note: "paused", createdBy: customerId, organizationId: orgA });
    const { rows } = await getEmployeeRollup(scopeFor("all"));
    expect(rows.find((r) => r.userId === String(customerId))).toBeUndefined();
  });

  it("notification buckets add up to the total, with a retried send still Delivered", async () => {
    const at = now + 400 * 86_400_000; // a window no other fixture touches
    const row = (status: "pending" | "processing" | "sent" | "failed", lastError: string | null) => ({
      channel: "email" as const, payload: {}, status, lastError, recipientEmail: "x@x.test", createdAt: at,
    });
    const inserted = await db
      .insert(notificationOutbox)
      .values([
        row("sent", null),
        row("sent", "timeout, retried"),
        row("sent", "skipped: no template"),
        row("failed", "boom"),
        row("pending", null),
        row("processing", null),
      ])
      .returning({ id: notificationOutbox.id });
    try {
      const b = await getNotificationBuckets(and(gte(notificationOutbox.createdAt, at - 1), lte(notificationOutbox.createdAt, at + 1)));
      expect(b).toEqual({ total: 6, sent: 2, skipped: 1, failed: 1, inFlight: 2 });
      expect(b.sent + b.skipped + b.failed + b.inFlight).toBe(b.total);
    } finally {
      await db.delete(notificationOutbox).where(inArray(notificationOutbox.id, inserted.map((r) => r.id)));
    }
  });
});
