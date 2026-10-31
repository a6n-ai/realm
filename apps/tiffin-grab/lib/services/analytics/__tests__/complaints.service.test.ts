import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inArray, ne } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { organization } = await import("@/db/schema");
const { deliveries, deliveryFrequencies, ledgerEntries, mealSizes, orderActivities, orders, payments, plans, ticketMessages, tickets, users } =
  await import("@/db/schema");
const {
  getByCategory,
  getBySubcategory,
  getComplaintKpis,
  getComplaintDaily,
  getNeedsAttention,
  getRepeatCustomers,
  getStatusMix,
  getTopIssues,
} = await import("../complaints.service");
const { buildAnalyticsScope } = await import("../metrics/scope");
const { deliveredTiffinCount } = await import("@/lib/services/tiffin-counts");

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const TZ = "America/Toronto";
const NO_FILTERS = { ...buildAnalyticsScope({}, "all", TZ, now), fromMs: 0, toMs: now + 365 * DAY };

async function reset() {
  dayCursor = 0;
  // Children before parents: orders carry payments/ledger/activity rows that
  // hold FKs, and tickets reference orders.
  await db.delete(ticketMessages);
  await db.delete(tickets);
  await db.delete(deliveries);
  await db.delete(ledgerEntries);
  await db.delete(payments);
  await db.delete(orderActivities);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

async function makeUser(email: string) {
  const [u] = await db.insert(users).values({ email, name: email.split("@")[0]!, role: "user" }).returning();
  return u!;
}

type TicketOver = Partial<{
  category: string;
  subcategory: string;
  status: string;
  priority: string;
  createdAt: number;
  closedAt: number | null;
  staffReplied: boolean;
  lastMessageAt: number;
}>;

async function makeTicket(userId: bigint, over: TicketOver = {}) {
  const createdAt = over.createdAt ?? now;
  const [t] = await db
    .insert(tickets)
    .values({
      raisedBy: userId,
      subject: "t",
      category: (over.category ?? "delivery") as never,
      subcategory: over.subcategory ?? "late_delivery",
      status: (over.status ?? "open") as never,
      priority: (over.priority ?? "normal") as never,
      createdAt,
      closedAt: over.closedAt ?? null,
    })
    .returning();
  await db.insert(ticketMessages).values({
    ticketId: t!.id,
    authorId: userId,
    authorType: "customer",
    body: "hi",
    createdAt: over.lastMessageAt ?? createdAt,
  });
  if (over.staffReplied) {
    await db.insert(ticketMessages).values({
      ticketId: t!.id,
      authorId: userId,
      authorType: "staff",
      body: "on it",
      createdAt: over.lastMessageAt ?? createdAt,
    });
  }
  return t!;
}

// deliveries are unique on (order_id, delivery_date), so fixtures step back a
// day each time rather than all landing on today.
let dayCursor = 0;

/** A delivery row whose tiffins should (or should not) count as delivered. */
async function makeDelivery(orderId: bigint, over: Partial<{ status: string; cutoffAt: number; tiffinUnits: number; optimo: string | null; date: string }> = {}) {
  await db.insert(deliveries).values({
    orderId,
    deliveryDate: over.date ?? new Date(now - dayCursor++ * DAY).toISOString().slice(0, 10),
    status: (over.status ?? "scheduled") as never,
    cutoffAt: over.cutoffAt ?? now - DAY,
    tiffinUnits: over.tiffinUnits ?? 1,
    // Delivered means confirmed: default to an OptimoRoute success unless the case says otherwise.
    optimoCompletionStatus: over.optimo === undefined ? "success" : over.optimo,
  });
}

/** Minimal valid order — only the columns the complaint queries join through. */
async function makeOrder(userId: bigint, organizationId?: string) {
  const [[plan], [mealSize], [freq]] = await Promise.all([
    db.select({ id: plans.id }).from(plans).limit(1),
    db.select({ id: mealSizes.id }).from(mealSizes).limit(1),
    db.select({ id: deliveryFrequencies.id }).from(deliveryFrequencies).limit(1),
  ]);
  const [o] = await db
    .insert(orders)
    .values({
      userId,
      organizationId,
      planId: plan!.id,
      mealSizeId: mealSize!.id,
      frequencyId: freq!.id,
      durationWeeks: 1,
      startDate: new Date(now).toISOString().slice(0, 10),
      tiffinCount: 5,
      perTiffinPrice: "10.00",
      pricingSnapshot: {},
      total: "50.00",
      deploymentId: `SUB-T${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      fullName: "Analytics Fixture",
      addressLine: "1 St",
      city: "Toronto",
      postalCode: "M5V 2T6",
    })
    .returning();
  return o!;
}

describe("complaint KPIs", () => {
  beforeEach(reset);
  afterAll(reset);

  it("counts complaints but not feedback, so compliments don't inflate the numbers", async () => {
    const u = await makeUser("a@x.test");
    await makeTicket(u.id, { category: "delivery" });
    await makeTicket(u.id, { category: "packaging" });
    await makeTicket(u.id, { category: "feedback", subcategory: "compliment" });

    const k = await getComplaintKpis(NO_FILTERS);
    expect(k.total).toBe(2);

    // ...but feedback is still visible in the category breakdown.
    const cats = await getByCategory(NO_FILTERS);
    expect(cats.find((c) => c.value === "feedback")).toMatchObject({ n: 1, isComplaint: false });
  });

  it("reports resolution rate and average resolution time", async () => {
    const u = await makeUser("b@x.test");
    await makeTicket(u.id, { status: "resolved", createdAt: now - 4 * 60 * 60 * 1000, closedAt: now });
    await makeTicket(u.id, { status: "open" });

    const k = await getComplaintKpis(NO_FILTERS);
    expect(k.resolved).toBe(1);
    expect(k.open).toBe(1);
    expect(k.resolutionRatePct).toBe(50);
    expect(k.avgResolutionHours).toBeCloseTo(4, 1);
  });

  it("honours the date range", async () => {
    const u = await makeUser("c@x.test");
    await makeTicket(u.id, { createdAt: now - 10 * DAY });
    await makeTicket(u.id, { createdAt: now });

    const recent = await getComplaintKpis({ ...NO_FILTERS, fromMs: now - 2 * DAY });
    expect(recent.total).toBe(1);
  });
});

describe("complaints per 100 tiffins", () => {
  beforeEach(reset);
  afterAll(reset);

  it("divides by delivered tiffins, so volume is comparable as the business grows", async () => {
    const u = await makeUser("d@x.test");
    const o = await makeOrder(u.id);
    // 200 delivered tiffins, 2 complaints → 1.0 per 100.
    for (let i = 0; i < 200; i++) await makeDelivery(o.id);
    await makeTicket(u.id);
    await makeTicket(u.id);

    const k = await getComplaintKpis(NO_FILTERS);
    expect(k.deliveredTiffins).toBe(200);
    expect(k.perHundredTiffins).toBe(1);
  });

  it("is unknown rather than zero when nothing was delivered", async () => {
    const u = await makeUser("e@x.test");
    await makeTicket(u.id);
    const k = await getComplaintKpis(NO_FILTERS);
    // 0 would read as "no problems"; there is one complaint and no denominator.
    expect(k.perHundredTiffins).toBeNull();
    expect(k.total).toBe(1);
  });

  it("counts the same rows the canonical tiffin-counts helper counts", async () => {
    // The SQL predicate duplicates lib/services/tiffin-counts.ts by necessity
    // (aggregating in the DB). This is the guard against the two drifting.
    const u = await makeUser("f@x.test");
    const o = await makeOrder(u.id);
    const rows = [
      { status: "scheduled" as const, cutoffAt: now - DAY, tiffinUnits: 2, optimo: null }, // past cutoff, unconfirmed → no
      { status: "scheduled" as const, cutoffAt: now + DAY, tiffinUnits: 1, optimo: "success" }, // confirmed early → counts
      { status: "scheduled" as const, cutoffAt: now + DAY, tiffinUnits: 5, optimo: null }, // future, unconfirmed → no
      { status: "skipped" as const, cutoffAt: now - DAY, tiffinUnits: 3, optimo: null }, // skipped → no
      { status: "paused" as const, cutoffAt: now - DAY, tiffinUnits: 4, optimo: null }, // paused → no
      { status: "cancelled" as const, cutoffAt: now - DAY, tiffinUnits: 7, optimo: null }, // cancelled → no
    ];
    for (const r of rows) await makeDelivery(o.id, r);

    const expected = deliveredTiffinCount(
      rows.map((r) => ({
        status: r.status,
        cutoffAt: r.cutoffAt,
        makeupForDeliveryId: null,
        pooledAt: null,
        tiffinUnits: r.tiffinUnits,
        optimoCompletionStatus: r.optimo,
      })),
      now,
    );

    const k = await getComplaintKpis(NO_FILTERS);
    expect(expected).toBe(1);
    expect(k.deliveredTiffins).toBe(expected);
  });
});

describe("breakdowns", () => {
  beforeEach(reset);
  afterAll(reset);

  it("derives New as open-with-no-staff-reply, without double counting it as Open", async () => {
    const u = await makeUser("g@x.test");
    await makeTicket(u.id, { status: "open" }); // never answered → New
    await makeTicket(u.id, { status: "open", staffReplied: true }); // answered → Open
    await makeTicket(u.id, { status: "resolved" });

    const mix = await getStatusMix(NO_FILTERS);
    const by = Object.fromEntries(mix.map((m) => [m.value, m.n]));
    expect(by.new).toBe(1);
    expect(by.open).toBe(1);
    // The slices sum to the total rather than counting the unanswered one twice.
    expect(mix.reduce((s, m) => s + m.n, 0)).toBe(3);
  });

  it("breaks a category down by sub-category", async () => {
    const u = await makeUser("h@x.test");
    await makeTicket(u.id, { category: "delivery", subcategory: "late_delivery" });
    await makeTicket(u.id, { category: "delivery", subcategory: "late_delivery" });
    await makeTicket(u.id, { category: "delivery", subcategory: "not_delivered" });

    const rows = await getBySubcategory(NO_FILTERS, "delivery");
    expect(rows.find((r) => r.value === "late_delivery")!.n).toBe(2);
    expect(rows.find((r) => r.value === "not_delivered")!.n).toBe(1);
  });

  it("ranks top issues by (category, sub-category)", async () => {
    const u = await makeUser("i@x.test");
    await makeTicket(u.id, { category: "food_meal", subcategory: "food_quality" });
    await makeTicket(u.id, { category: "food_meal", subcategory: "food_quality" });
    await makeTicket(u.id, { category: "packaging", subcategory: "leaking" });

    const top = await getTopIssues(NO_FILTERS);
    expect(top[0]).toMatchObject({ category: "food_meal", subcategory: "food_quality", n: 2 });
  });

  it("lists only customers who complained more than once", async () => {
    const once = await makeUser("j@x.test");
    const twice = await makeUser("k@x.test");
    await makeTicket(once.id);
    await makeTicket(twice.id);
    await makeTicket(twice.id);

    const rows = await getRepeatCustomers(NO_FILTERS);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ publicId: twice.publicId, n: 2 });
  });
});

describe("needs attention", () => {
  beforeEach(reset);
  afterAll(reset);

  it("counts high/critical, overdue and never-answered separately", async () => {
    const u = await makeUser("l@x.test");
    await makeTicket(u.id, { priority: "urgent", status: "open", staffReplied: true, lastMessageAt: now });
    await makeTicket(u.id, { status: "open", staffReplied: true, lastMessageAt: now - 2 * DAY }); // stale
    await makeTicket(u.id, { status: "open", lastMessageAt: now }); // never answered

    const a = await getNeedsAttention(NO_FILTERS, now);
    expect(a.urgent).toBe(1);
    expect(a.overdue).toBe(1);
    expect(a.unanswered).toBe(1);
  });

  it("does not treat a resolved ticket as overdue", async () => {
    const u = await makeUser("m@x.test");
    await makeTicket(u.id, { status: "resolved", staffReplied: true, lastMessageAt: now - 30 * DAY });
    const a = await getNeedsAttention(NO_FILTERS, now);
    expect(a.overdue).toBe(0);
  });
});

describe("complaint scope", () => {
  const orgIds: string[] = [];
  beforeEach(reset);
  afterAll(async () => {
    await reset();
    if (orgIds.length) await db.delete(organization).where(inArray(organization.id, orgIds));
  });

  const suffix = Math.random().toString(36).slice(2);
  const makeOrg = async (name: string) => {
    const [org] = await db.insert(organization).values({ name, clientCode: `CS-${name}-${suffix}` }).returning({ id: organization.id });
    orgIds.push(org!.id);
    return org!.id;
  };

  it("narrows the count by the Priority filter carried in the scope", async () => {
    const u = await makeUser("prio@x.test");
    await makeTicket(u.id, { priority: "urgent" });
    await makeTicket(u.id, { priority: "normal" });
    const scope = (priority?: string) => ({ ...NO_FILTERS, ...buildAnalyticsScope(priority ? { priority } : {}, "all", TZ, now), fromMs: 0, toMs: now + 365 * DAY });

    expect((await getComplaintKpis(scope())).total).toBe(2);
    expect((await getComplaintKpis(scope("urgent"))).total).toBe(1);
  });

  it("counts an orderless ticket only when every franchise is in scope", async () => {
    const orgA = await makeOrg("A");
    const orgB = await makeOrg("B");
    const u = await makeUser("scope@x.test");
    const oA = await makeOrder(u.id, orgA);
    const oB = await makeOrder(u.id, orgB);
    await db.insert(tickets).values([
      { raisedBy: u.id, subject: "a", category: "delivery" as never, status: "open" as never, priority: "normal" as never, createdAt: now, orderId: oA.id },
      { raisedBy: u.id, subject: "b", category: "delivery" as never, status: "open" as never, priority: "normal" as never, createdAt: now, orderId: oB.id },
      { raisedBy: u.id, subject: "none", category: "delivery" as never, status: "open" as never, priority: "normal" as never, createdAt: now },
    ]);

    expect((await getComplaintKpis(NO_FILTERS)).total).toBe(3);
    expect((await getComplaintKpis({ ...NO_FILTERS, orgIds: [orgA] })).total).toBe(1);
    expect((await getComplaintKpis({ ...NO_FILTERS, orgIds: [orgA, orgB] })).total).toBe(2);
    expect((await getComplaintKpis({ ...NO_FILTERS, orgIds: [] })).total).toBe(0);
  });

  it("buckets the trend by Toronto day, not UTC", async () => {
    const u = await makeUser("trend@x.test");
    // 23:30 Toronto (EDT, UTC-4) on Mar 31 is already Apr 1 in UTC.
    await makeTicket(u.id, { createdAt: Date.parse("2026-04-01T03:30:00Z") });
    await makeTicket(u.id, { createdAt: Date.parse("2026-04-01T15:00:00Z") });
    const rows = await getComplaintDaily({ ...NO_FILTERS, fromMs: Date.parse("2026-03-30T04:00:00Z"), toMs: Date.parse("2026-04-02T03:59:00Z") });
    expect(rows.map((r) => [r.iso, r.n])).toEqual([
      ["2026-03-31", 1],
      ["2026-04-01", 1],
    ]);
  });

  it("defaults to the current month in the app timezone", () => {
    const scope = buildAnalyticsScope({}, "all", TZ, Date.parse("2026-04-15T16:00:00Z"));
    expect(scope.fromMs).toBe(Date.parse("2026-04-01T04:00:00Z"));
    expect(scope.toMs).toBeLessThan(Date.parse("2026-05-01T04:00:00Z"));
    expect(scope.toMs).toBeGreaterThan(Date.parse("2026-04-30T12:00:00Z"));
  });
});
