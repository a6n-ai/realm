import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { coinRate, eventPayout, ledgerEntries, orders, walletLedger, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { walletService } from "../wallet.service";

let userId: bigint;
let orderId: bigint;

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
});

afterAll(async () => {
  await db.delete(ledgerEntries).where(eq(ledgerEntries.orderId, orderId));
  await db.delete(walletLedger).where(eq(walletLedger.userId, userId));
  await db.delete(coinRate).where(eq(coinRate.currency, "CAD"));
  await db.delete(orders).where(eq(orders.id, orderId));
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
    await db.insert(coinRate).values({ currency: "CAD", valuePerCoin: "0.1000" });
    const order = { id: orderId, total: 3, currency: "CAD" };
    const r = await walletService.redeem(userId, 50, order);
    expect(r.currencyValue).toBe(3);
    expect(r.coinsSpent).toBe(30);
    expect(await walletService.balance(userId)).toBe(20);
  });

  it("rejects redeeming more than balance", async () => {
    await expect(walletService.redeem(userId, 9999, { id: orderId, total: 100, currency: "CAD" }))
      .rejects.toThrow();
  });
});
