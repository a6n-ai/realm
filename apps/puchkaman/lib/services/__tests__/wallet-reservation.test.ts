import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { reserveRedemption, reverseRedemption, settleReservation } from "@foundry/wallet";
import { db } from "@/db/client";
import { ledgerEntries, orders, users, walletLedger } from "@/db/schema";
import { walletService } from "../wallet.service";
import { ledgerService } from "../ledger.service";

/**
 * Live-DB behaviour of the reservation mechanism. The package's own suite is
 * fake-tx only (it has no database harness), and the whole point of a hold is
 * what the SQL does with `reserved_until` — so the real assertions live here,
 * against a real wallet_ledger.
 *
 * No app call site uses this yet (see the task report): these functions are
 * driven directly, exactly as a migrated checkout would drive them.
 */

const EMAIL = "wallet-reservation@throwaway.local";

let userId: bigint;
let orderId: bigint;

const recordDiscount: Parameters<typeof reserveRedemption>[1]["recordRedemptionDiscount"] = (tx, args) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ledgerService.record(tx as any, { ...args, direction: "debit", type: "discount" });

async function cleanup() {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL)).limit(1);
  if (!u) return;
  const rows = await db.select({ id: orders.id }).from(orders).where(eq(orders.userId, u.id));
  await db.delete(walletLedger).where(eq(walletLedger.userId, u.id));
  for (const o of rows) {
    await db.delete(ledgerEntries).where(eq(ledgerEntries.orderId, o.id));
    await db.delete(orders).where(eq(orders.id, o.id));
  }
  await db.delete(users).where(eq(users.id, u.id));
}

beforeEach(async () => {
  await cleanup();
  const [u] = await db.insert(users).values({ email: EMAIL, name: "Reservation Test" }).returning();
  userId = u.id;
  const [o] = await db
    .insert(orders)
    .values({
      userId: u.id,
      customerName: "Reservation Test",
      customerEmail: EMAIL,
      customerPhone: "+15550000000",
      subtotal: "20.00",
      total: "20.00",
      pricingSnapshot: { currency: "CAD", lines: [], subtotal: 20, tax: 0, total: 20 },
    })
    .returning();
  orderId = o.id;

  await db.insert(walletLedger).values({
    userId,
    direction: "credit",
    eventType: "order_paid",
    sourceType: "seed",
    sourceId: `res-${userId}`,
    coins: 100,
  });
});

afterEach(cleanup);

const reserve = (over: { ttlMs?: number; now?: number; coins?: number } = {}) =>
  db.transaction((tx) =>
    reserveRedemption(tx, {
      userId,
      coins: over.coins ?? 40,
      currencyValue: 4,
      orderId,
      ttlMs: over.ttlMs ?? 60_000,
      now: over.now,
      walletLedger,
      orders,
      users,
      recordRedemptionDiscount: recordDiscount,
    }),
  );

const settle = (now?: number) =>
  db.transaction((tx) => settleReservation(tx, { userId, orderId, now, walletLedger, orders, users }));

const reservationRow = async () => {
  const [row] = await db
    .select()
    .from(walletLedger)
    .where(and(eq(walletLedger.sourceType, "redemption"), eq(walletLedger.sourceId, orderId.toString())))
    .limit(1);
  return row;
};

describe("reserveRedemption", () => {
  it("holds the balance without committing the debit", async () => {
    const { reservedUntil } = await reserve();

    // Held: the coins are gone from the spendable balance, so nothing else can
    // spend them — but the row is a hold, not a spend.
    expect(await walletService.balance(userId)).toBe(60);
    const row = await reservationRow();
    expect(row.direction).toBe("debit");
    expect(row.reservedUntil).toBe(reservedUntil);
    expect(reservedUntil).toBeGreaterThan(Date.now());

    // The order's discount is already quoted, so the money ledger says so now.
    const money = await db.select().from(ledgerEntries).where(eq(ledgerEntries.orderId, orderId));
    expect(money).toHaveLength(1);
  });

  it("refuses a hold the balance cannot cover, and counts a live hold against a later one", async () => {
    await expect(reserve({ coins: 101 })).rejects.toThrow(/insufficient coins/i);
    await reserve({ coins: 100 });
    expect(await walletService.balance(userId)).toBe(0);
  });
});

describe("settleReservation", () => {
  it("commits the hold in place — no second ledger row", async () => {
    await reserve();
    expect(await settle()).toEqual({ status: "settled", coins: 40 });

    expect((await reservationRow()).reservedUntil).toBeNull();
    expect(await walletService.balance(userId)).toBe(60);
    const rows = await db.select().from(walletLedger).where(eq(walletLedger.userId, userId));
    expect(rows).toHaveLength(2); // the seed credit and the one debit
  });

  it("is a no-op the second time", async () => {
    await reserve();
    await settle();
    expect(await settle()).toEqual({ status: "none", coins: 0 });
    expect(await walletService.balance(userId)).toBe(60);
  });

  it("reports an order that never reserved anything", async () => {
    expect(await settle()).toEqual({ status: "none", coins: 0 });
  });
});

describe("an expired reservation", () => {
  // Backdated rather than timer-driven: `now` is injectable precisely so
  // expiry is testable without sleeping.
  const expired = () => reserve({ now: Date.now() - 60_000, ttlMs: 1_000 });

  it("releases the coins with no sweep, no reversal row and no ledger adjustment", async () => {
    await expired();

    expect(await walletService.balance(userId)).toBe(100);
    const rows = await db.select().from(walletLedger).where(eq(walletLedger.userId, userId));
    expect(rows.filter((r) => r.sourceType === "redemption_reversal")).toEqual([]);
    expect(await walletService.earnSpendTotals(userId)).toEqual({ earned: 100, spent: 0 });
    // And it is not shown to the customer as a spend the balance disagrees with.
    const recent = await walletService.recentTransactions(userId);
    expect(recent.map((t) => t.sourceType)).toEqual(["seed"]);
  });

  it("refuses to settle instead of quietly taking coins that are already spendable again", async () => {
    await expired();
    expect(await settle()).toEqual({ status: "expired", coins: 40 });
    expect(await walletService.balance(userId)).toBe(100);
  });
});

describe("reverseRedemption against a hold", () => {
  const reverse = () =>
    db.transaction((tx) => reverseRedemption(tx, { userId, orderId, walletLedger, orders, users }));

  it("releases the hold early instead of writing a credit", async () => {
    await reserve();
    expect(await reverse()).toEqual({ coinsReturned: 40 });

    expect(await walletService.balance(userId)).toBe(100);
    const rows = await db.select().from(walletLedger).where(eq(walletLedger.userId, userId));
    expect(rows.filter((r) => r.sourceType === "redemption_reversal")).toEqual([]);
  });

  it("returns nothing the second time, so callers cannot mirror one release twice", async () => {
    await reserve();
    await reverse();
    expect(await reverse()).toEqual({ coinsReturned: 0 });
    expect(await walletService.balance(userId)).toBe(100);
  });
});
