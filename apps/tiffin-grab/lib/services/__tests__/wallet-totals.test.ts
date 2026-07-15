import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { coinRate, users, walletLedger } from "@/db/schema";
import { walletService } from "../wallet.service";

let userId: bigint;

beforeAll(async () => {
  const [u] = await db.insert(users).values({ email: "wallet-totals@throwaway.local" }).returning();
  userId = u.id;

  await db.insert(walletLedger).values([
    { userId, direction: "credit", eventType: "signup", sourceType: "signup", sourceId: "t-1", coins: 50, memo: null },
    { userId, direction: "credit", eventType: "manual_adjustment", sourceType: "manual", sourceId: "t-2", coins: 20, memo: null },
    { userId, direction: "debit", eventType: null, sourceType: "redeem", sourceId: "t-3", coins: 30, memo: null },
  ]);

  await db.insert(coinRate).values({ currency: "CAD", valuePerCoin: "0.01" });
});

afterAll(async () => {
  await db.delete(walletLedger).where(eq(walletLedger.userId, userId));
  await db.delete(coinRate).where(eq(coinRate.currency, "CAD"));
  await db.delete(users).where(eq(users.id, userId));
});

describe("walletService.earnSpendTotals", () => {
  it("sums credits and debits separately", async () => {
    const t = await walletService.earnSpendTotals(userId);
    expect(t).toEqual({ earned: 70, spent: 30 });
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
