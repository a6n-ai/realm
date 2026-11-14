import { afterAll, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => null }));

const { db } = await import("@/db/client");
const { inquiries, inquiryActivities, orders, organization, users } = await import("@/db/schema");
const { insertTestInquiry, insertTestOrder, insertTestUser } = await import("@/lib/inquiries/__tests__/helpers/inquiry-fixtures");
const { buildAnalyticsScope } = await import("../metrics/scope");
const { getLeadStats, getLostReasonBreakdown, getRenewalsByRound } = await import("../leads.service");

const TZ = "America/Toronto";
const DAY = 86_400_000;
const suffix = Math.random().toString(36).slice(2);

const inquiryIds: bigint[] = [];
const orderIds: bigint[] = [];
const userIds: bigint[] = [];
const orgIds: string[] = [];

// Each test gets its own franchise so counts never mix with other rows in the shared test DB.
async function newScope() {
  const now = Date.now();
  const [{ id }] = await db
    .insert(organization)
    .values({ name: `Round ${orgIds.length}`, clientCode: `RM-${suffix}-${orgIds.length}` })
    .returning({ id: organization.id });
  orgIds.push(id);
  const scope = buildAnalyticsScope({ from: String(now - DAY), to: String(now + DAY) }, [id], TZ, now);
  return { org: id, now, scope };
}

async function lead(org: string, values: Partial<typeof inquiries.$inferInsert> = {}) {
  const row = await insertTestInquiry({ organizationId: org, ...values });
  inquiryIds.push(row.id);
  return row;
}

async function activity(inquiryId: bigint, values: Omit<typeof inquiryActivities.$inferInsert, "inquiryId" | "createdAt"> & { createdAt?: number }) {
  await db.insert(inquiryActivities).values({ inquiryId, createdAt: Date.now() - 1000, ...values });
}

async function order(userId: bigint, createdAt: number) {
  const o = await insertTestOrder(userId, { createdAt });
  orderIds.push(o.id);
  return o;
}

afterAll(async () => {
  if (inquiryIds.length) {
    await db.delete(inquiryActivities).where(inArray(inquiryActivities.inquiryId, inquiryIds));
    await db.delete(inquiries).where(inArray(inquiries.id, inquiryIds));
  }
  if (orderIds.length) await db.delete(orders).where(inArray(orders.id, orderIds));
  if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
  if (orgIds.length) await db.delete(organization).where(inArray(organization.id, orgIds));
});

describe("round metrics (activity-counted analytics)", () => {
  it("new leads exclude origin purchase and backfill", async () => {
    const { org, scope } = await newScope();
    const a = await lead(org);
    const b = await lead(org);
    const c = await lead(org);
    await activity(a.id, { type: "created", details: { origin: "lead" } });
    await activity(b.id, { type: "created", details: { origin: "purchase" } });
    await activity(c.id, { type: "created", details: { origin: "backfill" } });

    expect((await getLeadStats(scope)).total).toBe(1);
  });

  it("a reopened reinquiry counts as a new lead; a plain reinquiry does not", async () => {
    const { org, scope } = await newScope();
    const a = await lead(org);
    await activity(a.id, { type: "created", details: { origin: "lead" } });
    await activity(a.id, { type: "reinquiry", details: { reopened: true } });
    await activity(a.id, { type: "reinquiry", details: {} });

    expect((await getLeadStats(scope)).total).toBe(2);
  });

  it("direct conversions are counted apart from lead-sourced conversions", async () => {
    const { org, scope } = await newScope();
    const leadInq = await lead(org);
    const purchaseInq = await lead(org);
    const backfillInq = await lead(org);
    await activity(leadInq.id, { type: "created", details: { origin: "lead" } });
    await activity(leadInq.id, { type: "converted" });
    await activity(purchaseInq.id, { type: "created", details: { origin: "purchase" } });
    await activity(purchaseInq.id, { type: "converted" });
    await activity(backfillInq.id, { type: "created", details: { origin: "backfill" } });
    await activity(backfillInq.id, { type: "converted" });

    const stats = await getLeadStats(scope);
    expect(stats.converted).toBe(1);
    expect(stats.direct).toBe(2);
    expect(stats.total).toBe(1);
    expect(stats.conversionRatePct).toBe(100);
  });

  it("renewal rate per renewal: due is stamped on the ending order, renewed on the new one", async () => {
    const { org, now, scope } = await newScope();
    const mk = async (tag: string) => {
      const [u] = await db.insert(users).values({ email: `rm-${suffix}-${tag}-${orgIds.length}@x.test`, name: "RM", role: "user" }).returning();
      userIds.push(u!.id);
      return u!;
    };
    // Customer A: first plan ends, comes due (renewal 1), renews with a second plan.
    const a = await mk("a");
    const aFirst = await order(a.id, now - 3 * DAY);
    const aSecond = await order(a.id, now - 2 * DAY);
    const ra = await lead(org, { customerId: a.id, currentOrderId: aSecond.id });
    await activity(ra.id, { type: "renewal_started", orderId: aFirst.id, details: { renewalStatusTo: "expected" } });
    await activity(ra.id, { type: "renewed", orderId: aSecond.id });
    // Customer B: first plan comes due (renewal 1) and lapses.
    const b = await mk("b");
    const bFirst = await order(b.id, now - 3 * DAY);
    const rb = await lead(org, { customerId: b.id, currentOrderId: bFirst.id });
    await activity(rb.id, { type: "renewal_started", orderId: bFirst.id, details: { renewalStatusTo: "expected" } });

    const rounds = await getRenewalsByRound(scope);
    expect(rounds).toHaveLength(4);
    expect(rounds[0]).toEqual({ round: 1, due: 2, renewed: 1, ratePct: 50 });
    expect(rounds[1]).toEqual({ round: 2, due: 0, renewed: 0, ratePct: null });
  });

  it("lost is split into lead and renewal, grouped by the activity's lost reason", async () => {
    const { org, now, scope } = await newScope();
    const [user] = await db.insert(users).values({ email: `rl-${suffix}-${orgIds.length}@x.test`, name: "RL", role: "user" }).returning();
    userIds.push(user!.id);
    const o = await order(user!.id, now - DAY);
    const leadInq = await lead(org);
    const renewalInq = await lead(org, { customerId: user!.id, currentOrderId: o.id });
    await activity(leadInq.id, { type: "stage_change", toStage: "lost", lostReason: "price" });
    await activity(renewalInq.id, { type: "stage_change", orderId: o.id, lostReason: "price", details: { renewalStatusTo: "not_renewed" } });

    const rows = await getLostReasonBreakdown(scope);
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        { kind: "lead", reason: "Price", n: 1 },
        { kind: "renewal", reason: "Price", n: 1 },
      ]),
    );
  });
});
