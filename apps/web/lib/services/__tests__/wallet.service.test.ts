import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { eventPayout, walletLedger, users } from "@/db/schema";
import { walletService } from "../wallet.service";

let userId: bigint;

beforeAll(async () => {
  const [u] = await db.insert(users).values({ email: "wallet-test@throwaway.local" }).returning();
  userId = u.id;
  await db.insert(eventPayout).values({ eventType: "order_activated", enabled: true, coins: 50 })
    .onConflictDoUpdate({ target: eventPayout.eventType, set: { enabled: true, coins: 50 } });
});

afterAll(async () => {
  await db.delete(walletLedger).where(eq(walletLedger.userId, userId));
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
