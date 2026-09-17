import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, ne } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";

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
const { setMaxCoinPctOfSubtotal, setPaymentConfig, setProvinceTaxes } = await import("../app-settings.service");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { sharedCache } = await import("@/lib/cache");

type Snapshot = {
  subtotal: number;
  total: number;
  taxTotal: number;
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
  await setMaxCoinPctOfSubtotal(null);
  await setProvinceTaxes({});
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

// startOffsetWeeks staggers non-overlapping delivery windows for a customer
// that needs several live orders at once (7*n days keeps the same weekday).
async function baseInput(over: { coins?: number; couponCode?: string; paymentMethodId?: string; startOffsetWeeks?: number } = {}) {
  const snap = await loadCatalogSnapshot();
  const startDate = nextWeekday(new Date());
  startDate.setUTCDate(startDate.getUTCDate() + (over.startOffsetWeeks ?? 0) * 7);
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
      startDate: startDate.toISOString().slice(0, 10),
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
    // Fixture address is Ontario, so HST applies on top of the discounted base.
    expect(Number(order!.total)).toBeCloseTo(snap.subtotal - expectedValue + snap.taxTotal, 2);

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
    expect(Number(order!.total)).toBeCloseTo(Math.max(0, snap.subtotal - coinLine!.amount) + snap.taxTotal, 2);

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
    expect(Number(order!.total)).toBeCloseTo(Math.max(0, snap.subtotal - combined) + snap.taxTotal, 2);
  });

  it("coins: 0 or omitted behaves exactly as today — no wallet rows written", async () => {
    const owner = await seedUserWithCoins(50);
    const { deploymentId } = await createOrder(await baseInput({ coins: 0 }), { ownerUserId: owner.publicId });
    const [order] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    const snap = order!.pricingSnapshot as Snapshot;
    expect(snap.adjustments.some((a) => a.label.startsWith("Coins"))).toBe(false);

    const { deploymentId: deploymentId2 } = await createOrder(await baseInput({ startOffsetWeeks: 1 }), { ownerUserId: owner.publicId });
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

  it("deferred settlement (real payment method): coins held at checkout, balance drops immediately", async () => {
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
    // Total already reflects the pending discount (plus Ontario HST).
    expect(Number(order!.total)).toBeCloseTo(snap.subtotal - snap.pendingCoinRedemption!.amount + snap.taxTotal, 2);

    // The coins are HELD, not parked: one redemption debit with an expiry, so the
    // wallet balance drops the moment the order is placed.
    const holds = await db.select().from(walletLedger).where(
      and(eq(walletLedger.userId, owner.id), eq(walletLedger.sourceType, "redemption")),
    );
    expect(holds).toHaveLength(1);
    expect(holds[0]!.coins).toBe(10);
    expect(holds[0]!.direction).toBe("debit");
    expect(holds[0]!.reservedUntil).toBeGreaterThan(Date.now());
    expect(await walletService.balance(owner.id)).toBe(40);

    // The discount is booked with the hold, since the quoted total already carries it.
    const discountRows = await db.select().from(ledgerEntries).where(
      and(eq(ledgerEntries.orderId, order!.id), eq(ledgerEntries.type, "discount")),
    );
    expect(discountRows).toHaveLength(1);
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
      await baseInput({ coins: 1, paymentMethodId: "etransfer", startOffsetWeeks: 1 }),
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
  // paying for the first is a supported flow. Coins used to be parked with no
  // ledger row, so both quotes saw the full balance and the clash only surfaced
  // at the second verification. A checkout hold is a real debit the balance
  // counts, so the second order is refused up front instead.
  it("cannot hold the same coins for two deferred orders", async () => {
    const owner = await seedUserWithCoins(10);

    const first = await createOrder(
      await baseInput({ coins: 10, paymentMethodId: "etransfer", startOffsetWeeks: 0 }),
      { ownerUserId: owner.publicId },
    );
    // The first order's hold already spent the balance...
    expect(await walletService.balance(owner.id)).toBe(0);

    // ...so the second is refused at checkout, not discovered at verification.
    await expect(
      createOrder(
        await baseInput({ coins: 10, paymentMethodId: "etransfer", startOffsetWeeks: 1 }),
        { ownerUserId: owner.publicId },
      ),
    ).rejects.toThrow(/insufficient coins/i);

    // Never negative, spent exactly once, and the refused order left nothing behind.
    expect(await walletService.balance(owner.id)).toBe(0);
    const [firstOrder] = await db.select().from(orders).where(eq(orders.deploymentId, first.deploymentId));
    const debits = await db.select().from(walletLedger).where(
      and(eq(walletLedger.userId, owner.id), eq(walletLedger.sourceType, "redemption")),
    );
    expect(debits).toHaveLength(1);
    expect(debits[0]!.sourceId).toBe(firstOrder!.id.toString());
    const ownerOrders = await db.select().from(orders).where(eq(orders.userId, owner.id));
    expect(ownerOrders).toHaveLength(1);
  });
});

describe("createOrder — admin coin limit and provincial tax", () => {
  beforeEach(async () => {
    await reset();
    const [cr] = await db.insert(coinRate).values({ currency: "CAD", valuePerCoin: RATE.toFixed(4) }).returning();
    coinRateId = cr.id;
  });
  afterEach(async () => {
    await db.delete(coinRate).where(eq(coinRate.id, coinRateId));
  });
  afterAll(async () => {
    await reset();
  });

  it("caps coins at the admin share of the pre-tax subtotal", async () => {
    await setMaxCoinPctOfSubtotal(30);
    await sharedCache("app-settings").evictAll();
    const owner = await seedUserWithCoins(100_000);

    const { deploymentId } = await createOrder(await baseInput({ coins: 100_000 }), { ownerUserId: owner.publicId });
    const [order] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    const snap = order!.pricingSnapshot as Snapshot;

    const coinLine = snap.adjustments.find((a) => a.label.startsWith("Coins ("));
    expect(coinLine).toBeDefined();
    const limit = Math.round(snap.subtotal * 0.3 * 100) / 100;
    // Never over the limit, and not short of it by more than one coin's worth.
    expect(coinLine!.amount).toBeLessThanOrEqual(limit);
    expect(coinLine!.amount).toBeGreaterThan(limit - RATE - 0.001);

    // Only the coins actually spent left the wallet — the rest stay spendable.
    const coinsSpent = Number(coinLine!.label.match(/Coins \((\d+)\)/)![1]);
    expect(await walletService.balance(owner.id)).toBe(100_000 - coinsSpent);
  });

  it("applies no coins when the admin limit is 0%", async () => {
    await setMaxCoinPctOfSubtotal(0);
    await sharedCache("app-settings").evictAll();
    const owner = await seedUserWithCoins(50);

    const { deploymentId } = await createOrder(await baseInput({ coins: 10 }), { ownerUserId: owner.publicId });
    const [order] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    expect((order!.pricingSnapshot as Snapshot).adjustments.some((a) => a.label.startsWith("Coins"))).toBe(false);
    expect(await walletService.balance(owner.id)).toBe(50);
  });

  it("charges an admin-overridden provincial rate and records the province", async () => {
    await setProvinceTaxes({ ON: [{ name: "HST", ratePct: 5 }] });
    await sharedCache("app-settings").evictAll();
    const owner = await seedUserWithCoins(0);

    const { deploymentId } = await createOrder(await baseInput(), { ownerUserId: owner.publicId });
    const [order] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    const snap = order!.pricingSnapshot as Snapshot & { taxLines: { name: string; ratePct: number }[]; taxProvince: string };

    expect(snap.taxProvince).toBe("ON");
    expect(snap.taxLines.map((l) => [l.name, l.ratePct])).toEqual([["HST", 5]]);
    expect(snap.taxTotal).toBeCloseTo(snap.subtotal * 0.05, 2);
  });

  it("falls back to the payment method's taxes when the address has no resolvable province", async () => {
    // An install that predates province tax keeps billing as before rather than
    // silently dropping to zero.
    await setPaymentConfig({
      methods: [{ id: "etransfer", kind: "manual", enabled: true, label: "Interac e-Transfer", payeeHandle: "pay@test.ca", taxes: [{ name: "GST", ratePct: 5 }] }],
    });
    await sharedCache("app-settings").evictAll();
    const owner = await seedUserWithCoins(0);

    const input = await baseInput({ paymentMethodId: "etransfer" });
    // Not a Canadian postal code, so no province can be resolved.
    const { deploymentId } = await createOrder(
      { ...input, contact: { ...input.contact, postalCode: "90210" } },
      { ownerUserId: owner.publicId },
    );
    const [order] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    const snap = order!.pricingSnapshot as Snapshot & { taxLines: { name: string }[]; taxProvince: string | null };
    expect(snap.taxProvince).toBeNull();
    expect(snap.taxLines.map((l) => l.name)).toEqual(["GST"]);
    expect(snap.taxTotal).toBeCloseTo(snap.subtotal * 0.05, 2);
  });

  it("charges no tax when an admin zeroes the province, even if the payment method has taxes", async () => {
    // A zeroed province is a deliberate "not taxable here" — falling back to the
    // method's own taxes would quietly re-tax it.
    await setPaymentConfig({
      methods: [{ id: "etransfer", kind: "manual", enabled: true, label: "Interac e-Transfer", payeeHandle: "pay@test.ca", taxes: [{ name: "GST", ratePct: 5 }] }],
    });
    await setProvinceTaxes({ ON: [{ name: "HST", ratePct: 0 }] });
    await sharedCache("app-settings").evictAll();
    const owner = await seedUserWithCoins(0);

    const { deploymentId } = await createOrder(await baseInput({ paymentMethodId: "etransfer" }), { ownerUserId: owner.publicId });
    const [order] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    const snap = order!.pricingSnapshot as Snapshot;
    expect(snap.taxTotal).toBe(0);
    expect(Number(order!.total)).toBeCloseTo(snap.subtotal, 2);
  });
});
