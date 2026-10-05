import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, like } from "drizzle-orm";

// Runs against the local dev DB. Payment rails and settings are pinned so the
// test does not depend on whatever the local app row has configured.
const cash = { id: "cash", kind: "manual" as const, enabled: true, label: "Cash", taxes: [] };

vi.mock("@/lib/services/app-settings.service", async (orig) => ({
  ...(await orig<typeof import("@/lib/services/app-settings.service")>()),
  getPaymentConfig: async () => ({ methods: [cash] }),
  getAppClock: async () => ({ timezone: "America/Toronto", currency: "CAD" }),
  getDiscountSettings: async () => ({ maxDiscountPct: 100 }),
}));
vi.mock("@/lib/services/payments.service", async (orig) => {
  const mod = await orig<typeof import("@/lib/services/payments.service")>();
  mod.paymentsService.enabledRails = async () => [cash];
  return mod;
});

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { bookingsService } = await import("../bookings.service");

const MARK = "disc-it";
let sessionId: bigint;
let occurrencePublicId: string;
let userPublicIds: string[];
// Discounts already active in the dev DB would also apply; park them for the test.
let parkedDiscountIds: bigint[] = [];

beforeEach(async () => {
  parkedDiscountIds = (
    await db
      .update(schema.discounts)
      .set({ active: false })
      .where(eq(schema.discounts.active, true))
      .returning({ id: schema.discounts.id })
  ).map((d) => d.id);
  const fams = await db
    .insert(schema.users)
    .values([1, 2].map((i) => ({ name: `${MARK} ${i}`, email: `${MARK}-${i}@example.test`, role: "user" as const })))
    .returning({ publicId: schema.users.publicId });
  userPublicIds = fams.map((f) => f.publicId);
  const startsAt = new Date(Date.now() + 7 * 86_400_000);
  const [s] = await db
    .insert(schema.studioSessions)
    .values({
      title: `${MARK} class`,
      category: "kids",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      capacity: 10,
      priceAmount: "20.00",
      published: true,
    })
    .returning({ id: schema.studioSessions.id });
  sessionId = s!.id;
  const [occ] = await db
    .insert(schema.studioSessionOccurrences)
    .values({ sessionId, occursOn: startsAt.toISOString().slice(0, 10) })
    .returning({ publicId: schema.studioSessionOccurrences.publicId });
  occurrencePublicId = occ!.publicId;
});

afterEach(async () => {
  const userIds = (
    await db.select({ id: schema.users.id }).from(schema.users).where(like(schema.users.email, `${MARK}-%`))
  ).map((u) => u.id);
  const couponIds = (
    await db.select({ id: schema.coupons.id }).from(schema.coupons).where(like(schema.coupons.code, "DISCIT%"))
  ).map((c) => c.id);
  if (couponIds.length) await db.delete(schema.couponRedemptions).where(inArray(schema.couponRedemptions.couponId, couponIds));
  if (userIds.length) {
    await db.delete(schema.ledgerEntries).where(inArray(schema.ledgerEntries.userId, userIds));
    await db.delete(schema.payments).where(inArray(schema.payments.userId, userIds));
    await db.delete(schema.bookings).where(inArray(schema.bookings.userId, userIds));
  }
  if (couponIds.length) await db.delete(schema.coupons).where(inArray(schema.coupons.id, couponIds));
  await db.delete(schema.discounts).where(like(schema.discounts.name, `${MARK}%`));
  await db.delete(schema.studioSessionOccurrences).where(eq(schema.studioSessionOccurrences.sessionId, sessionId));
  await db.delete(schema.studioSessions).where(eq(schema.studioSessions.id, sessionId));
  if (userIds.length) await db.delete(schema.users).where(inArray(schema.users.id, userIds));
  if (parkedDiscountIds.length) {
    await db.update(schema.discounts).set({ active: true }).where(inArray(schema.discounts.id, parkedDiscountIds));
  }
});

describe("createForUser with discounts", () => {
  it("lets only one of two racing families take a coupon's last use", async () => {
    await db.insert(schema.coupons).values({ code: "DISCIT1", name: `${MARK} last`, amountOff: "5.00", maxRedemptions: 1 });
    const results = await Promise.all(
      userPublicIds.map((u) => bookingsService.createForUser(u, occurrencePublicId, 1, { code: " discit1 " })),
    );
    const ids = results.map((b) => b.id);
    const mine = await db.select().from(schema.couponRedemptions).where(inArray(schema.couponRedemptions.bookingId, ids));
    expect(mine).toHaveLength(1);
    expect(results.map((r) => r.codeError).sort()).toEqual([null, "redemption_limit"].sort());
    const [c] = await db.select().from(schema.coupons).where(eq(schema.coupons.code, "DISCIT1"));
    expect(c!.redemptionCount).toBe(1);
  });

  it("confirms a fully discounted booking with no payment and records the discount", async () => {
    await db.insert(schema.coupons).values({ code: "DISCIT2", name: `${MARK} free`, amountOff: "50.00" });
    const b = await bookingsService.createForUser(userPublicIds[0]!, occurrencePublicId, 1, { code: "DISCIT2" });
    expect(b.status).toBe("confirmed");
    expect(b.paymentPublicId).toBeNull();
    expect(b.pricing).toMatchObject({ subtotal: 20, discountTotal: 20, total: 0 });
    const [led] = await db
      .select()
      .from(schema.ledgerEntries)
      .where(and(eq(schema.ledgerEntries.bookingId, b.id), eq(schema.ledgerEntries.type, "discount")));
    expect(led).toMatchObject({ direction: "credit", amount: "20.00" });
    const [red] = await db.select().from(schema.couponRedemptions).where(eq(schema.couponRedemptions.bookingId, b.id));
    expect(red!.amountApplied).toBe("20.00");
    await db
      .insert(schema.ledgerEntries)
      .values({ userId: b.userId, direction: "debit", type: "payment", amount: "1.00", currency: "CAD", memo: `${MARK} pay` });
    const { ledgerService } = await import("../ledger.service");
    const logs = await ledgerService.listRecent(500, "discount");
    expect(logs.every((r) => r.type === "discount")).toBe(true);
    expect(logs.some((r) => r.memo?.includes(`${MARK} free`))).toBe(true);
  });

  it("applies an automatic category discount and charges the rest", async () => {
    await db.insert(schema.discounts).values({ name: `${MARK} kids`, scope: "category", category: "kids", percentOff: "25.00" });
    const b = await bookingsService.createForUser(userPublicIds[0]!, occurrencePublicId, 1);
    expect(b.status).toBe("pending");
    const [pay] = await db.select().from(schema.payments).where(eq(schema.payments.bookingId, b.id));
    expect(pay!.amount).toBe("15.00");
    expect(b.pricing?.adjustments).toEqual([expect.objectContaining({ kind: "discount", amount: 5 })]);
  });
});
