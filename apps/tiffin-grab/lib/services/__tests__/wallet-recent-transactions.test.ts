import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, users, walletLedger } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { walletService } from "../wallet.service";

let userA: bigint;
let userB: bigint;
let orderA: bigint;

beforeAll(async () => {
  const [ua] = await db.insert(users).values({ email: "wallet-recent-a@throwaway.local" }).returning();
  userA = ua.id;
  const [ub] = await db.insert(users).values({ email: "wallet-recent-b@throwaway.local" }).returning();
  userB = ub.id;

  const snap = await loadCatalogSnapshot();
  const [o] = await db.insert(orders).values({
    userId: userA,
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
    deploymentId: "WALLET-RECENT-01",
    fullName: "Test User",
    addressLine: "1 Test St",
    city: "Toronto",
    postalCode: "M5V 2T6",
  }).returning();
  orderA = o.id;

  // User A: credit with an order (older), then debit without an order (newer)
  await db.insert(walletLedger).values({
    userId: userA,
    direction: "credit",
    eventType: "order_activated",
    sourceType: "order",
    sourceId: "wallet-recent-credit",
    coins: 50,
    orderId: orderA,
    createdAt: Date.now() - 2000,
  });
  await db.insert(walletLedger).values({
    userId: userA,
    direction: "debit",
    eventType: null,
    sourceType: "redemption",
    sourceId: "wallet-recent-debit",
    coins: 10,
    memo: "checkout redemption",
    createdAt: Date.now() - 1000,
  });

  // User B: a row that must never leak into A's results
  await db.insert(walletLedger).values({
    userId: userB,
    direction: "credit",
    eventType: "order_activated",
    sourceType: "order",
    sourceId: "wallet-recent-other-user",
    coins: 99,
  });
});

afterAll(async () => {
  await db.delete(walletLedger).where(eq(walletLedger.userId, userA));
  await db.delete(walletLedger).where(eq(walletLedger.userId, userB));
  await db.delete(orders).where(eq(orders.id, orderA));
  await db.delete(users).where(eq(users.id, userA));
  await db.delete(users).where(eq(users.id, userB));
});

describe("walletService.recentTransactions", () => {
  it("returns only the given user's rows, newest first, with orderPublicId resolved", async () => {
    const txs = await walletService.recentTransactions(userA);

    expect(txs).toHaveLength(2);
    expect(txs.every((t) => t.sourceId !== "wallet-recent-other-user")).toBe(true);

    const [newest, oldest] = txs;
    expect(newest.direction).toBe("debit");
    expect(newest.coins).toBe(10);
    expect(newest.eventType).toBeNull();
    expect(newest.sourceType).toBe("redemption");
    expect(newest.memo).toBe("checkout redemption");
    expect(newest.orderPublicId).toBeNull();

    expect(oldest.direction).toBe("credit");
    expect(oldest.coins).toBe(50);
    expect(oldest.eventType).toBe("order_activated");
    expect(oldest.orderPublicId).not.toBeNull();

    expect(newest.createdAt).toBeGreaterThanOrEqual(oldest.createdAt);
  });

  it("truncates to the given limit", async () => {
    const txs = await walletService.recentTransactions(userA, 1);
    expect(txs).toHaveLength(1);
    expect(txs[0].direction).toBe("debit");
  });

  it("never returns another user's rows", async () => {
    const txs = await walletService.recentTransactions(userB);
    expect(txs).toHaveLength(1);
    expect(txs[0].sourceId).toBe("wallet-recent-other-user");
  });
});
