import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, ne } from "drizzle-orm";
import { nextWeekday } from "@realm/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const {
  coinRate,
  coupons,
  couponRedemptions,
  deliveries,
  eventPayout,
  ledgerEntries,
  orderActivities,
  orders,
  payments,
  users,
  walletLedger,
} = await import("@/db/schema");
const { createOrder, verifyPayment } = await import("../orders.service");
const { walletService } = await import("../wallet.service");
const { setPaymentConfig } = await import("../app-settings.service");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { sharedCache } = await import("@/lib/cache");

type Snapshot = {
  subtotal: number;
  total: number;
  adjustments: { label: string; amount: number }[];
  pendingCoinRedemption?: { coins: number; amount: number };
};

// Own coin_rate row (0.5/coin) so the test isn't at the mercy of whatever the
// local DB's default CAD rate happens to be — activeRate picks the latest by
// createdAt, so this row shadows any pre-existing one for the run.
const RATE = 0.5;
let coinRateId: bigint;

async function reset() {
  await db.delete(walletLedger);
  await db.delete(ledgerEntries);
  await db.delete(couponRedemptions);
  await db.delete(coupons);
  await db.delete(eventPayout);
  await db.delete(deliveries);
  await db.delete(payments);
  await db.delete(orderActivities);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
  await setPaymentConfig({ methods: [] });
  await sharedCache("app-settings").evictAll();
}

// Seeded via "signup" rather than "order_activated" — createOrder itself
// awards order_activated coins on order creation, and event_payout for that
// event is left disabled here (reset() clears the table each test), so
// seeding through it would double-count against a fresh order's own award.
async function seedUserWithCoins(coins: number): Promise<{ id: bigint; publicId: string }> {
  const [u] = await db.insert(users).values({ email: `coins-${Math.random().toString(36).slice(2)}@x.com`, role: "user" }).returning();
  await db.insert(eventPayout).values({ eventType: "signup", enabled: true, coins })
    .onConflictDoUpdate({ target: eventPayout.eventType, set: { enabled: true, coins } });
  await walletService.award(u.id, "signup", { type: "seed", id: `seed-${u.id}` });
  return { id: u.id, publicId: u.publicId };
}

async function baseInput(over: { coins?: number; couponCode?: string; paymentMethodId?: string } = {}) {
  const snap = await loadCatalogSnapshot();
  return {
    planKey: snap.plans[0]!.key,
    selections: {
      mealSizeId: snap.mealSizes[0]!.publicId,
      frequencyKey: "5_day" as const,
      persons: 1,
      mealSlots: ["lunch"],
      includeSaturday: false,
      includeSunday: false,
      durationWeeks: 1,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: {
      email: `u${Math.random().toString(36).slice(2)}@test.invalid`,
      fullName: "Coin Test",
      phone: "+16475550777",
      addressLine: "1 St",
      city: "Toronto",
      postalCode: "M5V 2T6",
    },
    coins: over.coins,
    couponCode: over.couponCode ?? null,
    paymentMethodId: over.paymentMethodId ?? null,
  };
}

describe("createOrder — coin redemption", () => {
  beforeEach(async () => {
    await reset();
    const [cr] = await db.insert(coinRate).values({ currency: "CAD", valuePerCoin: RATE.toFixed(4) }).returning();
    coinRateId = cr.id;
  });
  // Delete THIS test's row right after it runs — beforeEach overwrites coinRateId
  // on every test, so an afterAll-only teardown deletes just the last insert and
  // orphans every earlier one (and, across describe blocks, orphans the first
  // block's row entirely).
  afterEach(async () => {
    await db.delete(coinRate).where(eq(coinRate.id, coinRateId));
  });
  afterAll(async () => {
    await reset();
  });

  it("spends coins as a discount: total drops, wallet debit + discount ledger row match", async () => {
    const owner = await seedUserWithCoins(50); // balance 50, value 50*0.5 = 25
    const { deploymentId } = await createOrder(await baseInput({ coins: 10 }), { ownerUserId: owner.publicId });
    const [order] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    const snap = order!.pricingSnapshot as Snapshot;

    const expectedValue = 10 * RATE; // 5.00, well under the subtotal
    expect(snap.adjustments.some((a) => a.label.startsWith("Coins (10)") && a.amount === expectedValue)).toBe(true);
    expect(Number(order!.total)).toBeCloseTo(snap.subtotal - expectedValue, 2);

    const debit = await db.select().from(walletLedger).where(
      and(eq(walletLedger.userId, owner.id), eq(walletLedger.sourceType, "redemption"), eq(walletLedger.sourceId, order!.id.toString())),
    );
    expect(debit).toHaveLength(1);
    expect(debit[0]!.coins).toBe(10);
    expect(debit[0]!.direction).toBe("debit");

    const discountRow = await db.select().from(ledgerEntries).where(
      and(eq(ledgerEntries.orderId, order!.id), eq(ledgerEntries.type, "discount")),
    );
    expect(discountRow).toHaveLength(1);
    expect(Number(discountRow[0]!.amount)).toBeCloseTo(expectedValue, 2);

    expect(await walletService.balance(owner.id)).toBe(40);
  });

  it("caps the coin discount at the remaining subtotal", async () => {
    const owner = await seedUserWithCoins(10_000); // way more value than any order's subtotal
    const { deploymentId } = await createOrder(await baseInput({ coins: 10_000 }), { ownerUserId: owner.publicId });
    const [order] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    const snap = order!.pricingSnapshot as Snapshot;

    const coinLine = snap.adjustments.find((a) => a.label.startsWith("Coins"));
    expect(coinLine).toBeDefined();
    expect(coinLine!.amount).toBeLessThanOrEqual(snap.subtotal);
    expect(Number(order!.total)).toBeCloseTo(Math.max(0, snap.subtotal - coinLine!.amount), 2);

    // Only the coins actually needed to zero out the subtotal were spent.
    const coinsSpent = Math.round(coinLine!.amount / RATE);
    expect(await walletService.balance(owner.id)).toBe(10_000 - coinsSpent);
    expect(coinsSpent).toBeLessThan(10_000);
  });

  it("stacks with a coupon without the combined discount exceeding the subtotal", async () => {
    await db.insert(coupons).values({ code: "STACK5", kind: "fixed", name: "Stack 5", valueAmount: "5", stackable: true, maxRedemptions: 5 });
    const owner = await seedUserWithCoins(50); // value 25
    const { deploymentId } = await createOrder(
      await baseInput({ coins: 20, couponCode: "STACK5" }),
      { ownerUserId: owner.publicId },
    );
    const [order] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    const snap = order!.pricingSnapshot as Snapshot;

    const couponLine = snap.adjustments.find((a) => a.label.includes("STACK5"));
    const coinLine = snap.adjustments.find((a) => a.label.startsWith("Coins"));
    expect(couponLine).toBeDefined();
    expect(coinLine).toBeDefined();
    const combined = couponLine!.amount + coinLine!.amount;
    expect(combined).toBeLessThanOrEqual(snap.subtotal);
    expect(Number(order!.total)).toBeCloseTo(Math.max(0, snap.subtotal - combined), 2);
  });

  it("coins: 0 or omitted behaves exactly as today — no wallet rows written", async () => {
    const owner = await seedUserWithCoins(50);
    const { deploymentId } = await createOrder(await baseInput({ coins: 0 }), { ownerUserId: owner.publicId });
    const [order] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    const snap = order!.pricingSnapshot as Snapshot;
    expect(snap.adjustments.some((a) => a.label.startsWith("Coins"))).toBe(false);

    const { deploymentId: deploymentId2 } = await createOrder(await baseInput(), { ownerUserId: owner.publicId });
    const [order2] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId2));
    const snap2 = order2!.pricingSnapshot as Snapshot;
    expect(snap2.adjustments.some((a) => a.label.startsWith("Coins"))).toBe(false);

    const rows = await db.select().from(walletLedger).where(eq(walletLedger.userId, owner.id));
    // Only the earn/award row from seeding — no redemption debit.
    expect(rows.every((r) => r.sourceType !== "redemption")).toBe(true);
    expect(await walletService.balance(owner.id)).toBe(50);
  });

  it("rejects an order when more coins are requested than the balance holds", async () => {
    const owner = await seedUserWithCoins(5);
    await expect(
      createOrder(await baseInput({ coins: 9999 }), { ownerUserId: owner.publicId }),
    ).rejects.toThrow(/insufficient coins/i);

    // Failed order must not have written anything.
    const orderRows = await db.select().from(orders).where(eq(orders.userId, owner.id));
    expect(orderRows).toHaveLength(0);
    expect(await walletService.balance(owner.id)).toBe(5);
  });

  it("deferred settlement (real payment method): no wallet rows, coins parked in the snapshot", async () => {
    await setPaymentConfig({
      methods: [
        {
          id: "etransfer",
          kind: "manual",
          enabled: true,
          label: "Interac e-Transfer",
          payeeHandle: "pay@test.ca",
          taxes: [],
        },
      ],
    });
    await sharedCache("app-settings").evictAll();

    const owner = await seedUserWithCoins(50);
    const { deploymentId } = await createOrder(
      await baseInput({ coins: 10, paymentMethodId: "etransfer" }),
      { ownerUserId: owner.publicId },
    );
    const [order] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    const snap = order!.pricingSnapshot as Snapshot;

    expect(snap.pendingCoinRedemption).toBeDefined();
    expect(snap.pendingCoinRedemption!.coins).toBe(10);
    expect(snap.pendingCoinRedemption!.amount).toBeCloseTo(10 * RATE, 2);
    // Total already reflects the pending discount even though nothing settled.
    expect(Number(order!.total)).toBeCloseTo(snap.subtotal - snap.pendingCoinRedemption!.amount, 2);

    const rows = await db.select().from(walletLedger).where(eq(walletLedger.userId, owner.id));
    expect(rows.every((r) => r.sourceType !== "redemption")).toBe(true);
    const discountRows = await db.select().from(ledgerEntries).where(
      and(eq(ledgerEntries.orderId, order!.id), eq(ledgerEntries.type, "discount")),
    );
    expect(discountRows).toHaveLength(0);
    expect(await walletService.balance(owner.id)).toBe(50);
  });

  // capRedemption rounds currency to 2dp AFTER recomputing coinsSpent, so a
  // sub-cent rate yields coinsSpent > 0 with currencyValue === 0. The debit and
  // the snapshot park used to be gated on coinsSpent while the discount line was
  // gated on currencyValue — burning real coins for a 0.00 discount that never
  // reduced orders.total.
  it("burns no coins when a sub-cent rate rounds the discount to 0.00", async () => {
    // Swap this test's rate row rather than shadowing it: activeRate picks the
    // latest by createdAt, and two inserts can land in the same millisecond.
    // Reassigning coinRateId keeps afterEach's single-row cleanup exact.
    await db.delete(coinRate).where(eq(coinRate.id, coinRateId));
    const [cr] = await db.insert(coinRate).values({ currency: "CAD", valuePerCoin: "0.0001" }).returning();
    coinRateId = cr.id;

    const owner = await seedUserWithCoins(50);
    const { deploymentId } = await createOrder(await baseInput({ coins: 1 }), { ownerUserId: owner.publicId });
    const [order] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    const snap = order!.pricingSnapshot as Snapshot;

    expect(snap.adjustments.some((a) => a.label.startsWith("Coins"))).toBe(false);
    expect(Number(order!.total)).toBeCloseTo(snap.total, 2);

    const rows = await db.select().from(walletLedger).where(
      and(eq(walletLedger.userId, owner.id), eq(walletLedger.sourceType, "redemption")),
    );
    expect(rows).toHaveLength(0);
    const discountRows = await db.select().from(ledgerEntries).where(
      and(eq(ledgerEntries.orderId, order!.id), eq(ledgerEntries.type, "discount")),
    );
    expect(discountRows).toHaveLength(0);
    expect(await walletService.balance(owner.id)).toBe(50);

    // Same predicate must gate the deferred park, not just the immediate debit.
    await setPaymentConfig({
      methods: [{ id: "etransfer", kind: "manual", enabled: true, label: "Interac e-Transfer", payeeHandle: "pay@test.ca", taxes: [] }],
    });
    await sharedCache("app-settings").evictAll();
    const { deploymentId: deferredId } = await createOrder(
      await baseInput({ coins: 1, paymentMethodId: "etransfer" }),
      { ownerUserId: owner.publicId },
    );
    const [deferred] = await db.select().from(orders).where(eq(orders.deploymentId, deferredId));
    expect((deferred!.pricingSnapshot as Snapshot).pendingCoinRedemption).toBeUndefined();
    expect(await walletService.balance(owner.id)).toBe(50);
  });
});

describe("verifyPayment — settles deferred coin redemption", () => {
  beforeEach(async () => {
    await reset();
    const [cr] = await db.insert(coinRate).values({ currency: "CAD", valuePerCoin: RATE.toFixed(4) }).returning();
    coinRateId = cr.id;
    await setPaymentConfig({
      methods: [
        {
          id: "etransfer",
          kind: "manual",
          enabled: true,
          label: "Interac e-Transfer",
          payeeHandle: "pay@test.ca",
          taxes: [],
        },
      ],
    });
    await sharedCache("app-settings").evictAll();
  });
  // Same reasoning as the block above: delete per-test, not just at the end.
  afterEach(async () => {
    await db.delete(coinRate).where(eq(coinRate.id, coinRateId));
  });
  afterAll(async () => {
    await reset();
  });

  it("debits the wallet and writes the discount ledger row on verify, and strips pendingCoinRedemption from the snapshot", async () => {
    const owner = await seedUserWithCoins(50);
    const { deploymentId } = await createOrder(
      await baseInput({ coins: 10, paymentMethodId: "etransfer" }),
      { ownerUserId: owner.publicId },
    );
    const [order] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    const [pay] = await db.select().from(payments).where(eq(payments.orderId, order!.id));

    await verifyPayment(pay!.publicId);

    const debit = await db.select().from(walletLedger).where(
      and(eq(walletLedger.userId, owner.id), eq(walletLedger.sourceType, "redemption"), eq(walletLedger.sourceId, order!.id.toString())),
    );
    expect(debit).toHaveLength(1);
    expect(debit[0]!.coins).toBe(10);

    const discountRow = await db.select().from(ledgerEntries).where(
      and(eq(ledgerEntries.orderId, order!.id), eq(ledgerEntries.type, "discount")),
    );
    expect(discountRow).toHaveLength(1);
    expect(Number(discountRow[0]!.amount)).toBeCloseTo(10 * RATE, 2);

    expect(await walletService.balance(owner.id)).toBe(40);

    const [reloaded] = await db.select().from(orders).where(eq(orders.id, order!.id));
    const snap = reloaded!.pricingSnapshot as Snapshot;
    expect(snap.pendingCoinRedemption).toBeUndefined();
  });

  it("does not double-spend when the same payment is verified twice", async () => {
    const owner = await seedUserWithCoins(50);
    const { deploymentId } = await createOrder(
      await baseInput({ coins: 10, paymentMethodId: "etransfer" }),
      { ownerUserId: owner.publicId },
    );
    const [order] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    const [pay] = await db.select().from(payments).where(eq(payments.orderId, order!.id));

    await verifyPayment(pay!.publicId);
    await verifyPayment(pay!.publicId); // second verify: payments.status is already "paid" — must be a no-op

    const debit = await db.select().from(walletLedger).where(
      and(eq(walletLedger.userId, owner.id), eq(walletLedger.sourceType, "redemption"), eq(walletLedger.sourceId, order!.id.toString())),
    );
    expect(debit).toHaveLength(1);
    expect(await walletService.balance(owner.id)).toBe(40);
  });

  // Two deferred orders, one balance. Placing a second subscription before
  // paying for the first is a supported flow, so no concurrency is needed:
  // both quotes see the full balance because a parked redemption writes
  // nothing. The per-order dedupe cannot help — two orders are two legitimate
  // redemptions. Only commitRedemption's own balance re-assert can stop the
  // second settlement from spending coins that are already gone.
  it("cannot settle two deferred orders against one balance", async () => {
    const owner = await seedUserWithCoins(10);
    const orderIds: bigint[] = [];
    const paymentIds: string[] = [];
    for (let i = 0; i < 2; i++) {
      const { deploymentId } = await createOrder(
        await baseInput({ coins: 10, paymentMethodId: "etransfer" }),
        { ownerUserId: owner.publicId },
      );
      const [order] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
      const [pay] = await db.select().from(payments).where(eq(payments.orderId, order!.id));
      // Both orders were quoted against the same 10 coins and both parked it.
      expect((order!.pricingSnapshot as Snapshot).pendingCoinRedemption!.coins).toBe(10);
      orderIds.push(order!.id);
      paymentIds.push(pay!.publicId);
    }

    await verifyPayment(paymentIds[0]!);
    expect(await walletService.balance(owner.id)).toBe(0);

    await expect(verifyPayment(paymentIds[1]!)).rejects.toThrow(/insufficient coins to settle redemption/i);

    // The balance is spent exactly once and never goes negative.
    expect(await walletService.balance(owner.id)).toBe(0);
    const debits = await db.select().from(walletLedger).where(
      and(eq(walletLedger.userId, owner.id), eq(walletLedger.sourceType, "redemption")),
    );
    expect(debits).toHaveLength(1);
    expect(debits[0]!.sourceId).toBe(orderIds[0]!.toString());

    // The rejected verify rolled back whole: no discount row, no unfunded
    // discount in the books for the second order.
    const discountRows = await db.select().from(ledgerEntries).where(
      and(eq(ledgerEntries.orderId, orderIds[1]!), eq(ledgerEntries.type, "discount")),
    );
    expect(discountRows).toHaveLength(0);
    const [secondPay] = await db.select().from(payments).where(eq(payments.publicId, paymentIds[1]!));
    expect(secondPay!.status).not.toBe("paid");
  });
});
