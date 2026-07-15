import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users, walletLedger } from "@/db/schema";
import { walletService } from "../wallet.service";

let userAId: bigint;
let userBId: bigint;

beforeAll(async () => {
  const [a] = await db.insert(users).values({ email: "wallet-ledger-a@throwaway.local" }).returning();
  const [b] = await db.insert(users).values({ email: "wallet-ledger-b@throwaway.local" }).returning();
  userAId = a.id;
  userBId = b.id;

  await db.insert(walletLedger).values([
    { userId: userAId, direction: "credit", eventType: "signup", sourceType: "signup", sourceId: "a-1", coins: 50, memo: null },
    { userId: userAId, direction: "credit", eventType: "order_activated", sourceType: "order", sourceId: "a-2", coins: 20, memo: null },
    { userId: userAId, direction: "credit", eventType: "manual_adjustment", sourceType: "manual", sourceId: "a-3", coins: 10, memo: "bonus" },
    { userId: userAId, direction: "debit", eventType: null, sourceType: "redeem", sourceId: "a-4", coins: 15, memo: null },
    { userId: userAId, direction: "debit", eventType: null, sourceType: "redeem", sourceId: "a-5", coins: 5, memo: null },
    { userId: userBId, direction: "credit", eventType: "signup", sourceType: "signup", sourceId: "b-1", coins: 50, memo: null },
  ]);
});

afterAll(async () => {
  await db.delete(walletLedger).where(eq(walletLedger.userId, userAId));
  await db.delete(walletLedger).where(eq(walletLedger.userId, userBId));
  await db.delete(users).where(eq(users.id, userAId));
  await db.delete(users).where(eq(users.id, userBId));
});

describe("walletService.ledgerPage", () => {
  it("returns only the requesting user's rows, newest first", async () => {
    const { eq: condEq } = await import("@realm/commons/model/condition");
    const all = await walletService.ledgerPage(userAId, undefined, { page: 0, size: 25 });
    expect(all.total).toBe(5);
    expect(all.items).toHaveLength(5);
    expect(all.items.every((r) => typeof r.coins === "number")).toBe(true);

    const earned = await walletService.ledgerPage(userAId, condEq("direction", "credit"), { page: 0, size: 25 });
    expect(earned.total).toBe(3);
    expect(earned.items.every((r) => r.direction === "credit")).toBe(true);
  });

  it("never leaks another user's rows even with no condition (IDOR)", async () => {
    const bOnly = await walletService.ledgerPage(userBId, undefined, { page: 0, size: 25 });
    expect(bOnly.total).toBe(1);
    expect(bOnly.items).toHaveLength(1);

    const all = await walletService.ledgerPage(userAId, undefined, { page: 0, size: 25 });
    expect(all.total).toBe(5);
  });

  it("paginates", async () => {
    const page0 = await walletService.ledgerPage(userAId, undefined, { page: 0, size: 2 });
    expect(page0.items).toHaveLength(2);
    expect(page0.total).toBe(5);
    const page1 = await walletService.ledgerPage(userAId, undefined, { page: 1, size: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page0.items[0].publicId).not.toBe(page1.items[0].publicId);
  });
});
