import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { coinRate, users, walletLedger } from "@/db/schema";
import { walletService } from "../wallet.service";

let userId: bigint;
let reversedId: bigint;
let rateId: bigint;

beforeAll(async () => {
  const [u] = await db.insert(users).values({ email: "wallet-totals@throwaway.local" }).returning();
  userId = u.id;

  await db.insert(walletLedger).values([
    { userId, direction: "credit", eventType: "signup", sourceType: "signup", sourceId: "t-1", coins: 50, memo: null },
    { userId, direction: "credit", eventType: "manual_adjustment", sourceType: "manual", sourceId: "t-2", coins: 20, memo: null },
    { userId, direction: "debit", eventType: null, sourceType: "redemption", sourceId: "t-3", coins: 30, memo: null },
  ]);

  const [r] = await db.insert(users).values({ email: "wallet-totals-reversed@throwaway.local" }).returning();
  reversedId = r.id;
  await db.insert(walletLedger).values([
    { userId: reversedId, direction: "credit", eventType: "order_activated", sourceType: "order", sourceId: "t-r1", coins: 100, memo: null },
    { userId: reversedId, direction: "debit", eventType: "order_activated", sourceType: "order_reversal", sourceId: "t-r1", coins: 100, memo: null },
    { userId: reversedId, direction: "debit", eventType: null, sourceType: "redemption", sourceId: "t-r2", coins: 30, memo: null },
    { userId: reversedId, direction: "credit", eventType: null, sourceType: "redemption_reversal", sourceId: "t-r2", coins: 30, memo: null },
  ]);

  ;[{ id: rateId }] = await db.insert(coinRate).values({ currency: "CAD", valuePerCoin: "0.01" }).returning({ id: coinRate.id });
  await (await import("@/lib/wallet/coin-rate-cache")).coinRateCache.evictAll(); // direct coin_rate write
});

afterAll(async () => {
  await db.delete(walletLedger).where(eq(walletLedger.userId, userId));
  await db.delete(walletLedger).where(eq(walletLedger.userId, reversedId));
  await db.delete(users).where(eq(users.id, reversedId));
  // Only this suite's rate: deleting every CAD row also removed the seeded rate other suites need.
  await db.delete(coinRate).where(eq(coinRate.id, rateId));
  await (await import("@/lib/wallet/coin-rate-cache")).coinRateCache.evictAll(); // direct coin_rate write
  await db.delete(users).where(eq(users.id, userId));
});

describe("walletService.earnSpendTotals", () => {
  it("sums credits and debits separately", async () => {
    const t = await walletService.earnSpendTotals(userId);
    expect(t).toEqual({ earned: 70, spent: 30 });
  });

  it("nets out clawed-back awards and returned spends", async () => {
    const t = await walletService.earnSpendTotals(reversedId);
    expect(t).toEqual({ earned: 0, spent: 0 });
  });
});

describe("walletService.moneyValue", () => {
  it("converts coins to currency using the active rate", async () => {
    expect(await walletService.moneyValue(100, "CAD")).toBeCloseTo(1.0);
  });

  it("returns null (not a throw) when there is no coin_rate for the currency", async () => {
    await expect(walletService.moneyValue(100, "ZZZ")).resolves.toBeNull();
  });
});
