import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, like } from "drizzle-orm";

// Local dev DB. Payment rails/settings are pinned so the test does not depend on the app row.
const cash = { id: "cash", kind: "manual" as const, enabled: true, label: "Cash", taxes: [] };

vi.mock("@/lib/services/app-settings.service", async (orig) => ({
  ...(await orig<typeof import("@/lib/services/app-settings.service")>()),
  getPaymentConfig: async () => ({ methods: [cash] }),
  getAppClock: async () => ({ timezone: "America/Toronto", currency: "CAD" }),
  getDiscountSettings: async () => ({ maxDiscountPct: 100 }),
  getMaxWalletBalance: async () => null,
}));
vi.mock("@/lib/services/payments.service", async (orig) => {
  const mod = await orig<typeof import("@/lib/services/payments.service")>();
  mod.paymentsService.enabledRails = async () => [cash];
  return mod;
});

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { bookingsService } = await import("../bookings.service");
const { paymentsService } = await import("../payments.service");
const { walletService } = await import("../wallet.service");

const MARK = "wallet-it";
let userId: bigint;
let userPublicId: string;
let classIds: bigint[] = [];
let parkedPayouts: { eventType: string; enabled: boolean; coins: number }[] = [];
let parkedDiscountIds: bigint[] = [];

async function priceClass(category: "birthday" | "kids", price: string, days: number) {
  const startsAt = new Date(Date.now() + days * 86_400_000);
  const [s] = await db
    .insert(schema.studioSessions)
    .values({
      title: `${MARK} ${category}`,
      category,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      capacity: 10,
      priceAmount: price,
      published: true,
    })
    .returning({ id: schema.studioSessions.id });
  classIds.push(s!.id);
  const [occ] = await db
    .insert(schema.studioSessionOccurrences)
    .values({ sessionId: s!.id, occursOn: startsAt.toISOString().slice(0, 10) })
    .returning({ publicId: schema.studioSessionOccurrences.publicId });
  return occ!.publicId;
}

async function bookAndVerify(occurrencePublicId: string) {
  const b = await bookingsService.createForUser(userPublicId, occurrencePublicId, 1);
  await paymentsService.claim(b.paymentPublicId!, userPublicId, "ref-1");
  await paymentsService.verify(b.paymentPublicId!);
  return b;
}

beforeEach(async () => {
  await walletService.ensurePayoutRows();
  parkedPayouts = await db.select().from(schema.eventPayout);
  await db.update(schema.eventPayout).set({ enabled: false, coins: 0 });
  for (const [eventType, coins] of [["booking_paid", 10], ["first_booking", 5], ["birthday_booking", 7]] as const) {
    await db.update(schema.eventPayout).set({ enabled: true, coins }).where(eq(schema.eventPayout.eventType, eventType));
  }
  parkedDiscountIds = (
    await db.update(schema.discounts).set({ active: false }).where(eq(schema.discounts.active, true)).returning({ id: schema.discounts.id })
  ).map((d) => d.id);
  const [u] = await db
    .insert(schema.users)
    .values({ name: `${MARK} fam`, email: `${MARK}-fam@example.test`, role: "user" })
    .returning({ id: schema.users.id, publicId: schema.users.publicId });
  userId = u!.id;
  userPublicId = u!.publicId;
  classIds = [];
});

afterEach(async () => {
  await db.delete(schema.walletLedger).where(eq(schema.walletLedger.userId, userId));
  await db.delete(schema.couponRedemptions).where(eq(schema.couponRedemptions.userId, userId));
  await db.delete(schema.ledgerEntries).where(eq(schema.ledgerEntries.userId, userId));
  await db.delete(schema.payments).where(eq(schema.payments.userId, userId));
  await db.delete(schema.bookings).where(eq(schema.bookings.userId, userId));
  if (classIds.length) {
    await db.delete(schema.studioSessionOccurrences).where(inArray(schema.studioSessionOccurrences.sessionId, classIds));
    await db.delete(schema.studioSessions).where(inArray(schema.studioSessions.id, classIds));
  }
  await db.delete(schema.coupons).where(like(schema.coupons.code, "WALLETIT%"));
  await db.delete(schema.users).where(eq(schema.users.id, userId));
  for (const p of parkedPayouts) {
    await db
      .update(schema.eventPayout)
      .set({ enabled: p.enabled, coins: p.coins })
      .where(eq(schema.eventPayout.eventType, p.eventType as never));
  }
  if (parkedDiscountIds.length) {
    await db.update(schema.discounts).set({ active: true }).where(inArray(schema.discounts.id, parkedDiscountIds));
  }
});

describe("event payouts", () => {
  it("has no sign-up event: the welcome bonus is the first paid booking", async () => {
    expect(schema.APP_EVENTS).not.toContain("signup");
  });

  it("pays booking, first-booking and birthday coins once, on verify", async () => {
    // First paid booking: booking 10 + welcome (first booking) 5 + birthday 7.
    const first = await bookAndVerify(await priceClass("birthday", "20.00", 7));
    expect(await walletService.balance(userId)).toBe(22);

    await walletService.awardBookingEvents(first.id);
    expect(await walletService.balance(userId)).toBe(22);

    await bookAndVerify(await priceClass("birthday", "20.00", 8));
    expect(await walletService.balance(userId)).toBe(39);
  });

  it("pays first-booking coins exactly once when two bookings are verified at once", async () => {
    const [a, b] = [await priceClass("kids", "20.00", 7), await priceClass("kids", "20.00", 8)];
    const ba = await bookingsService.createForUser(userPublicId, a, 1);
    const bb = await bookingsService.createForUser(userPublicId, b, 1);
    await paymentsService.claim(ba.paymentPublicId!, userPublicId, "r1");
    await paymentsService.claim(bb.paymentPublicId!, userPublicId, "r2");
    await Promise.all([paymentsService.verify(ba.paymentPublicId!), paymentsService.verify(bb.paymentPublicId!)]);
    expect(await walletService.balance(userId)).toBe(25);
  });

  it("only lets staff adjust customer wallets", async () => {
    const [staff] = await db
      .insert(schema.users)
      .values({ name: `${MARK} staff`, email: `${MARK}-staff@example.test`, role: "admin" })
      .returning({ id: schema.users.id, publicId: schema.users.publicId });
    try {
      await expect(walletService.familyUserId(staff!.publicId)).rejects.toThrow(/customer/i);
      expect(await walletService.familyUserId(userPublicId)).toBe(userId);
    } finally {
      await db.delete(schema.users).where(eq(schema.users.id, staff!.id));
    }
  });

  it("pays nothing when a coupon makes a priced booking free (no money changed hands)", async () => {
    await db.insert(schema.coupons).values({ code: "WALLETIT1", name: `${MARK} free`, amountOff: "50.00" });
    const b = await bookingsService.createForUser(userPublicId, await priceClass("kids", "20.00", 7), 1, { code: "WALLETIT1" });
    expect(b.status).toBe("confirmed");
    expect(await walletService.balance(userId)).toBe(0);
  });

  it("pays nothing for a free class", async () => {
    const b = await bookingsService.createForUser(userPublicId, await priceClass("kids", "0.00", 7), 1);
    expect(b.status).toBe("confirmed");
    expect(await walletService.balance(userId)).toBe(0);
  });
});
