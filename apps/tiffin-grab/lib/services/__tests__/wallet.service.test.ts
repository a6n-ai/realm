import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { ValidationError } from "@realm/commons";
import { db } from "@/db/client";
import { coinRate, eventPayout, ledgerEntries, orders, walletLedger, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { walletService } from "../wallet.service";

let userId: bigint;
let orderId: bigint;
let orderId2: bigint;
let orderId3: bigint;
let coinRateId: bigint;

beforeAll(async () => {
  const [u] = await db.insert(users).values({ email: "wallet-test@throwaway.local" }).returning();
  userId = u.id;
  await db.insert(eventPayout).values({ eventType: "order_activated", enabled: true, coins: 50 })
    .onConflictDoUpdate({ target: eventPayout.eventType, set: { enabled: true, coins: 50 } });

  const snap = await loadCatalogSnapshot();
  const [o] = await db.insert(orders).values({
    userId,
    planId: snap.plans[0].id,
    mealSizeId: snap.mealSizes[0].id,
    frequencyId: snap.frequencies[0].id,
    persons: 1,
    durationWeeks: 1,
    startDate: "2030-01-06",
    tiffinCount: 5,
    perTiffinPrice: "10.00",
    pricingSnapshot: {},
    total: "50.00",
    status: "active",
    deploymentId: "WALLET-TEST-01",
    fullName: "Test User",
    addressLine: "1 Test St",
    city: "Toronto",
    postalCode: "M5V 2T6",
  }).returning();
  orderId = o.id;

  const [o2] = await db.insert(orders).values({
    userId,
    planId: snap.plans[0].id,
    mealSizeId: snap.mealSizes[0].id,
    frequencyId: snap.frequencies[0].id,
    persons: 1,
    durationWeeks: 1,
    startDate: "2030-01-07",
    tiffinCount: 5,
    perTiffinPrice: "10.00",
    pricingSnapshot: {},
    total: "50.00",
    status: "active",
    deploymentId: "WALLET-TEST-02",
    fullName: "Test User",
    addressLine: "1 Test St",
    city: "Toronto",
    postalCode: "M5V 2T6",
  }).returning();
  orderId2 = o2.id;

  const [o3] = await db.insert(orders).values({
    userId,
    planId: snap.plans[0].id,
    mealSizeId: snap.mealSizes[0].id,
    frequencyId: snap.frequencies[0].id,
    persons: 1,
    durationWeeks: 1,
    startDate: "2030-01-08",
    tiffinCount: 5,
    perTiffinPrice: "10.00",
    pricingSnapshot: {},
    total: "50.00",
    status: "active",
    deploymentId: "WALLET-TEST-03",
    fullName: "Test User",
    addressLine: "1 Test St",
    city: "Toronto",
    postalCode: "M5V 2T6",
  }).returning();
  orderId3 = o3.id;

  const [cr] = await db.insert(coinRate).values({ currency: "CAD", valuePerCoin: "0.1000" }).returning();
  coinRateId = cr.id;
});

afterAll(async () => {
  await db.delete(ledgerEntries).where(eq(ledgerEntries.orderId, orderId));
  await db.delete(ledgerEntries).where(eq(ledgerEntries.orderId, orderId2));
  await db.delete(ledgerEntries).where(eq(ledgerEntries.orderId, orderId3));
  await db.delete(walletLedger).where(eq(walletLedger.userId, userId));
  await db.delete(coinRate).where(eq(coinRate.id, coinRateId));
  await db.delete(orders).where(eq(orders.id, orderId));
  await db.delete(orders).where(eq(orders.id, orderId2));
  await db.delete(orders).where(eq(orders.id, orderId3));
  await db.delete(users).where(eq(users.id, userId));
});

describe("WalletService earn", () => {
  it("awards coins for an enabled event and reflects balance", async () => {
    const wrote = await walletService.award(userId, "order_activated", { type: "order", id: "ord_test1" });
    expect(wrote).toBe(true);
    expect(await walletService.balance(userId)).toBe(50);
  });

  it("is idempotent — same source does not double-pay", async () => {
    await walletService.award(userId, "order_activated", { type: "order", id: "ord_test1" });
    expect(await walletService.balance(userId)).toBe(50);
  });

  it("no-ops for a disabled/unknown event", async () => {
    const wrote = await walletService.award(userId, "order_completed", { type: "order", id: "ord_test2" });
    expect(wrote).toBe(false);
  });
});

describe("WalletService redeem", () => {
  it("converts coins to a capped discount and debits the wallet", async () => {
    const order = { id: orderId, total: 3, currency: "CAD" };
    const r = await walletService.redeem(userId, 50, order);
    expect(r.currencyValue).toBe(3);
    expect(r.coinsSpent).toBe(30);
    expect(await walletService.balance(userId)).toBe(20);
  });

  it("is idempotent — same order cannot be redeemed twice", async () => {
    const balBefore = await walletService.balance(userId);
    await expect(walletService.redeem(userId, 10, { id: orderId, total: 100, currency: "CAD" }))
      .rejects.toThrow("coins already redeemed for this order");
    expect(await walletService.balance(userId)).toBe(balBefore);
  });

  it("non-round rate: ledgerEntries amount never exceeds order.total", async () => {
    // Award coins so balance is enough to trigger the cap (need coins*0.07 >= 3.00 → 43+ coins)
    await walletService.award(userId, "order_activated", { type: "order", id: "ord-cap-rate-test" });
    // balance is now 20 + 50 = 70; 50*0.07=3.50 > 3.00 — triggers the cap
    // Use orderId2 (a fresh order) so the idempotency guard does not fire
    const [cr07] = await db.insert(coinRate).values({ currency: "CAD", valuePerCoin: "0.0700" }).returning();
    try {
      const r = await walletService.redeem(userId, 50, { id: orderId2, total: 3.00, currency: "CAD" });
      expect(r.currencyValue).toBeLessThanOrEqual(3.00);
    } finally {
      await db.delete(coinRate).where(eq(coinRate.id, cr07.id));
    }
  });

  it("rejects redeeming more than balance", async () => {
    await expect(walletService.redeem(userId, 9999, { id: orderId3, total: 100, currency: "CAD" }))
      .rejects.toThrow(/insufficient coins/i);
  });

  it("rejects zero coins", async () => {
    await expect(walletService.redeem(userId, 0, { id: orderId, total: 100, currency: "CAD" }))
      .rejects.toThrow(ValidationError);
  });

  it("rejects negative coins", async () => {
    await expect(walletService.redeem(userId, -5, { id: orderId, total: 100, currency: "CAD" }))
      .rejects.toThrow(ValidationError);
  });
});
