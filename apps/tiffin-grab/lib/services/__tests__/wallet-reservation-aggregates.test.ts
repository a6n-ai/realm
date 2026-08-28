import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users, walletLedger } from "@/db/schema";
import { walletLedgerStats } from "@/app/(dashboard)/dashboard/wallet/ledger/page";
import { walletService } from "../wallet.service";

vi.mock("../app-settings.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../app-settings.service")>()),
  getMaxWalletBalance: async () => 100,
}));

/**
 * The two aggregate queries that read `wallet_ledger` directly instead of
 * going through `walletService.balance()` — the bulk cap check and the admin
 * ledger stat cards. Both have to apply the same `unexpired()` rule or they
 * silently disagree with the balance the customer sees.
 *
 * Deltas, not absolutes: the stat cards are global and the dev DB holds other
 * wallets.
 */

const EMAIL = "wallet-reservation-agg@throwaway.local";

let userId: bigint;

async function cleanup() {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL)).limit(1);
  if (!u) return;
  await db.delete(walletLedger).where(eq(walletLedger.userId, u.id));
  await db.delete(users).where(eq(users.id, u.id));
}

beforeEach(async () => {
  await cleanup();
  const [u] = await db.insert(users).values({ email: EMAIL }).returning();
  userId = u.id;
  await db.insert(walletLedger).values({
    userId, direction: "credit", eventType: "signup", sourceType: "seed", sourceId: `agg-${u.id}`, coins: 100,
  });
});

afterEach(cleanup);

const hold = (reservedUntil: number) =>
  db.insert(walletLedger).values({
    userId, direction: "debit", sourceType: "redemption", sourceId: `agg-${userId}`,
    coins: 40, reservedUntil,
  });

const capDecision = async () => {
  // cap 100, asking for 1 coin: fits only if the wallet reads as 60, not 100.
  const { ok } = await walletService.filterUnderCap([userId], 1);
  return ok.length === 1;
};

describe("bulk cap check (filterUnderCap)", () => {
  it("counts a live hold against the wallet", async () => {
    await hold(Date.now() + 60_000);
    expect(await capDecision()).toBe(true); // 60 + 1 <= 100
  });

  it("ignores an expired hold — the coins came back", async () => {
    await hold(Date.now() - 60_000);
    expect(await capDecision()).toBe(false); // 100 + 1 > 100
  });
});

describe("admin wallet ledger stat cards", () => {
  it("counts a live hold as redeemed, and an expired one as nothing at all", async () => {
    const before = (await walletLedgerStats()).agg;

    await hold(Date.now() + 60_000);
    const live = (await walletLedgerStats()).agg;
    expect(live.redeemed - before.redeemed).toBe(40);
    expect(live.entries - before.entries).toBe(1);

    await db.update(walletLedger)
      .set({ reservedUntil: Date.now() - 60_000 })
      .where(and(eq(walletLedger.userId, userId), eq(walletLedger.sourceType, "redemption")));
    const expired = (await walletLedgerStats()).agg;
    expect(expired.redeemed - before.redeemed).toBe(0);
    expect(expired.entries - before.entries).toBe(0);
  });
});
