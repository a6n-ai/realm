import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";

// Local dev DB. Tax-free cash rail and CAD are pinned so amounts are exact.
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

const MARK = "wallet-bk-it";
let userId: bigint;
let userPublicId: string;
let classIds: bigint[] = [];
let rateIds: bigint[] = [];
let parkedDiscountIds: bigint[] = [];
let parkedRates: { id: bigint }[] = [];
let parkedPayouts: { eventType: string; enabled: boolean }[] = [];

async function occurrence(price: string, days: number) {
  const startsAt = new Date(Date.now() + days * 86_400_000);
  const [s] = await db
    .insert(schema.studioSessions)
    .values({
      title: `${MARK} class`,
      category: "kids",
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

async function setRate() {
  const [r] = await db.insert(schema.coinRate).values({ currency: "CAD", valuePerCoin: "0.1000" }).returning({ id: schema.coinRate.id });
  rateIds.push(r!.id);
}

beforeEach(async () => {
  // Payouts would add coins on verify; these tests count coins spent only.
  parkedPayouts = await db.select({ eventType: schema.eventPayout.eventType, enabled: schema.eventPayout.enabled }).from(schema.eventPayout);
  await db.update(schema.eventPayout).set({ enabled: false });
  // Park anything that would change prices or rates: active discounts and other CAD rates.
  parkedDiscountIds = (
    await db.update(schema.discounts).set({ active: false }).where(eq(schema.discounts.active, true)).returning({ id: schema.discounts.id })
  ).map((d) => d.id);
  parkedRates = await db.select({ id: schema.coinRate.id }).from(schema.coinRate).where(eq(schema.coinRate.currency, "CAD"));
  if (parkedRates.length) {
    await db.update(schema.coinRate).set({ currency: "CAD-parked" }).where(inArray(schema.coinRate.id, parkedRates.map((r) => r.id)));
  }
  const [u] = await db
    .insert(schema.users)
    .values({ name: `${MARK} fam`, email: `${MARK}-fam@example.test`, role: "user" })
    .returning({ id: schema.users.id, publicId: schema.users.publicId });
  userId = u!.id;
  userPublicId = u!.publicId;
  classIds = [];
  rateIds = [];
});

afterEach(async () => {
  await db.delete(schema.walletLedger).where(eq(schema.walletLedger.userId, userId));
  await db.delete(schema.ledgerEntries).where(eq(schema.ledgerEntries.userId, userId));
  await db.delete(schema.payments).where(eq(schema.payments.userId, userId));
  const bookingIds = (await db.select({ id: schema.bookings.id }).from(schema.bookings).where(eq(schema.bookings.userId, userId))).map((b) => b.id);
  if (bookingIds.length) {
    const publicIds = (await db.select({ p: schema.bookings.publicId }).from(schema.bookings).where(inArray(schema.bookings.id, bookingIds))).map((b) => b.p);
    await db.delete(schema.auditLog).where(and(eq(schema.auditLog.entity, "bookings"), inArray(schema.auditLog.entityPublicId, publicIds)));
    await db.delete(schema.bookings).where(inArray(schema.bookings.id, bookingIds));
  }
  if (classIds.length) {
    await db.delete(schema.studioSessionOccurrences).where(inArray(schema.studioSessionOccurrences.sessionId, classIds));
    await db.delete(schema.studioSessions).where(inArray(schema.studioSessions.id, classIds));
  }
  await db.delete(schema.users).where(eq(schema.users.id, userId));
  if (rateIds.length) await db.delete(schema.coinRate).where(inArray(schema.coinRate.id, rateIds));
  if (parkedRates.length) {
    await db.update(schema.coinRate).set({ currency: "CAD" }).where(inArray(schema.coinRate.id, parkedRates.map((r) => r.id)));
  }
  if (parkedDiscountIds.length) {
    await db.update(schema.discounts).set({ active: true }).where(inArray(schema.discounts.id, parkedDiscountIds));
  }
  for (const p of parkedPayouts) {
    await db.update(schema.eventPayout).set({ enabled: p.enabled }).where(eq(schema.eventPayout.eventType, p.eventType as never));
  }
});

describe("spending coins on bookings", () => {
  it("covers a whole booking from coins and confirms it straight away", async () => {
    await setRate();
    await walletService.adjust({ userId, coins: 300, memo: "test", actorId: null });
    const b = await bookingsService.createForUser(userPublicId, await occurrence("25.00", 7), 1, { useCoins: true });
    expect(b.status).toBe("confirmed");
    expect(b.paymentPublicId).toBeNull();
    expect(b.pricing?.adjustments).toEqual([expect.objectContaining({ kind: "wallet", amount: 25, coins: 250 })]);
    expect(await walletService.balance(userId)).toBe(50);
  });

  it("holds coins while payment is pending and spends them on verify", async () => {
    await setRate();
    await walletService.adjust({ userId, coins: 100, memo: "test", actorId: null });
    const b = await bookingsService.createForUser(userPublicId, await occurrence("25.00", 7), 1, { useCoins: true });
    const [pay] = await db.select().from(schema.payments).where(eq(schema.payments.bookingId, b.id));
    expect(pay!.amount).toBe("15.00");
    expect(await walletService.balance(userId)).toBe(0);
    expect(await walletService.coinsForFamily(userPublicId)).toMatchObject({ balance: 0, held: 100 });

    await paymentsService.claim(pay!.publicId, userPublicId, "ref");
    await paymentsService.verify(pay!.publicId);
    const [hold] = await db.select().from(schema.walletLedger).where(eq(schema.walletLedger.orderId, b.id));
    expect(hold).toMatchObject({ direction: "debit", coins: 100, reservedUntil: null });
    expect(await walletService.balance(userId)).toBe(0);
  });

  it("never lets two bookings spend the same coins", async () => {
    await setRate();
    await walletService.adjust({ userId, coins: 100, memo: "test", actorId: null });
    const [a, c] = await Promise.all([occurrence("25.00", 7), occurrence("25.00", 8)]);
    await Promise.all([
      bookingsService.createForUser(userPublicId, a, 1, { useCoins: true }),
      bookingsService.createForUser(userPublicId, c, 1, { useCoins: true }),
    ]);
    const held = await db
      .select({ coins: schema.walletLedger.coins })
      .from(schema.walletLedger)
      .where(and(eq(schema.walletLedger.userId, userId), eq(schema.walletLedger.direction, "debit")));
    expect(held.reduce((s, r) => s + r.coins, 0)).toBe(100);
    expect(await walletService.balance(userId)).toBe(0);
  });

  async function expiredHoldBooking() {
    await setRate();
    await walletService.adjust({ userId, coins: 100, memo: "test", actorId: null });
    const b = await bookingsService.createForUser(userPublicId, await occurrence("25.00", 7), 1, { useCoins: true });
    await db.update(schema.walletLedger).set({ reservedUntil: 1 }).where(eq(schema.walletLedger.orderId, b.id));
    const [pay] = await db.select().from(schema.payments).where(eq(schema.payments.bookingId, b.id));
    await paymentsService.claim(pay!.publicId, userPublicId, "ref");
    return { b, pay: pay! };
  }

  async function auditNotes(publicId: string) {
    const rows = await db
      .select({ changes: schema.auditLog.changes })
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.entity, "bookings"), eq(schema.auditLog.entityPublicId, publicId)));
    return rows.map((r) => JSON.stringify(r.changes)).join(" ");
  }

  it("takes the coins again on verify when the hold lapsed but the family still has them", async () => {
    const { b, pay } = await expiredHoldBooking();
    expect(await walletService.balance(userId)).toBe(100);
    await paymentsService.verify(pay.publicId);
    const [booking] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, b.id));
    expect(booking!.status).toBe("confirmed");
    expect(await walletService.balance(userId)).toBe(0);
    expect(await auditNotes(b.publicId)).toContain('"collected":100');
  });

  it("confirms the payment and flags the shortfall when the lapsed coins were spent elsewhere", async () => {
    const { b, pay } = await expiredHoldBooking();
    await walletService.adjust({ userId, coins: -100, memo: "spent elsewhere", actorId: null });
    await paymentsService.verify(pay.publicId);
    const [booking] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, b.id));
    expect(booking!.status).toBe("confirmed");
    expect(await walletService.balance(userId)).toBe(0);
    const notes = await auditNotes(b.publicId);
    expect(notes).toContain('"collected":0');
    expect(notes).toContain('"notCollected":100');
  });

  it("re-collects lapsed coins once when the same payment is verified twice at once", async () => {
    const { pay } = await expiredHoldBooking();
    await walletService.adjust({ userId, coins: 50, memo: "more", actorId: null });
    const results = await Promise.allSettled([paymentsService.verify(pay.publicId), paymentsService.verify(pay.publicId)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await walletService.balance(userId)).toBe(50);
  });

  it("cancelling an unpaid booking frees the seat, returns held coins and blocks a later claim", async () => {
    await setRate();
    await walletService.adjust({ userId, coins: 100, memo: "test", actorId: null });
    const b = await bookingsService.createForUser(userPublicId, await occurrence("25.00", 7), 1, { useCoins: true });
    const [pay] = await db.select().from(schema.payments).where(eq(schema.payments.bookingId, b.id));
    expect(await walletService.balance(userId)).toBe(0);

    await bookingsService.cancel(b.publicId);

    const [booking] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, b.id));
    expect(booking!.status).toBe("cancelled");
    expect(await walletService.balance(userId)).toBe(100);
    const [payAfter] = await db.select().from(schema.payments).where(eq(schema.payments.id, pay!.id));
    expect(payAfter!.status).toBe("rejected");
    await expect(paymentsService.claim(pay!.publicId, userPublicId, "ref")).rejects.toThrow(/cancelled/i);
    await expect(bookingsService.cancel(b.publicId)).rejects.toThrow(/already cancelled/i);
  });

  it("cancelling a paid booking takes back the coins it earned; spent coins stay spent", async () => {
    await setRate();
    await walletService.ensurePayoutRows();
    await db.update(schema.eventPayout).set({ enabled: true, coins: 10 }).where(eq(schema.eventPayout.eventType, "booking_paid"));
    await db.update(schema.eventPayout).set({ enabled: true, coins: 5 }).where(eq(schema.eventPayout.eventType, "first_booking"));
    await walletService.adjust({ userId, coins: 100, memo: "test", actorId: null });
    const b = await bookingsService.createForUser(userPublicId, await occurrence("25.00", 7), 1, { useCoins: true });
    const [pay] = await db.select().from(schema.payments).where(eq(schema.payments.bookingId, b.id));
    await paymentsService.claim(pay!.publicId, userPublicId, "ref");
    await paymentsService.verify(pay!.publicId);
    expect(await walletService.balance(userId)).toBe(15);

    await bookingsService.cancel(b.publicId);
    expect(await walletService.balance(userId)).toBe(0);
    const [payAfter] = await db.select().from(schema.payments).where(eq(schema.payments.id, pay!.id));
    expect(payAfter!.status).toBe("paid");
  });

  it("ignores coins when no coin rate is set", async () => {
    await walletService.adjust({ userId, coins: 100, memo: "test", actorId: null });
    const b = await bookingsService.createForUser(userPublicId, await occurrence("25.00", 7), 1, { useCoins: true });
    const [pay] = await db.select().from(schema.payments).where(eq(schema.payments.bookingId, b.id));
    expect(pay!.amount).toBe("25.00");
    expect(await walletService.balance(userId)).toBe(100);
  });
});
