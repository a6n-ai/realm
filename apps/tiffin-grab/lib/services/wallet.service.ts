import {
  createWalletService,
  commitRedemption,
  lockAndQuoteRedemption,
  reserveRedemption,
  reverseAward,
  reverseRedemption,
  settleReservation,
  unexpired,
  type WalletDeps,
  type WalletTx as PackageWalletTx,
} from "@foundry/wallet";
import { and, eq, sql } from "drizzle-orm";
import { ValidationError } from "@foundry/commons";
import { db } from "@/db/client";
import { coinRate, eventPayout, ledgerEntries, orderActivities, orders, users, walletLedger } from "@/db/schema";
import type { OrderPricingSnapshot } from "@/lib/pricing";
import { earnCoins } from "@/lib/wallet/earn-coins";
import { earnsOrderCoins } from "@/lib/wallet/earns-coins";
import { getAppSettings, getCoinEarnPct, getMaxWalletBalance } from "./app-settings.service";

export type BusinessEvent = (typeof walletLedger.eventType.enumValues)[number];
export type WalletTx = PackageWalletTx<BusinessEvent>;

// A transaction handle from db.transaction — same shape as orders.service.ts's Tx.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// The app's own money ledger. Kept here rather than in the package because
// ledger_entries is app-local and its columns differ between apps. Typed via
// WalletDeps so `tx` gets the package's own (untyped-schema) Tx, not the
// app's — the two PgTransaction schema generics are not assignable to each other.
const recordRedemptionDiscount: WalletDeps<BusinessEvent>["recordRedemptionDiscount"] = async (
  tx,
  { userId, orderId, amount, memo },
) =>
  void (await tx.insert(ledgerEntries).values({
    userId,
    orderId,
    direction: "debit",
    type: "discount",
    amount,
    memo,
  }));

// The original class-based wallet.service.ts folded balance/ledgerPage/award/
// recentTransactions/earnSpendTotals/moneyValue/activeRate/redeem into the
// shared @foundry/wallet package (createWalletService) — puchkaman reuses the
// same factory. Only the tiffin-grab-specific piece (the wallet cap) is wired here.
const baseWalletService = createWalletService<BusinessEvent>({
  db,
  tables: { walletLedger, eventPayout, coinRate },
  orders,
  users,
  recordRedemptionDiscount,
  // Wallet cap (Coin Rate page; NULL = unlimited) is enforced by the package:
  // award() skips, adjust() refuses, filterUnderCap() splits a batch.
  maxBalance: () => getMaxWalletBalance(),
});

export const walletService = baseWalletService;

// App-bound wrappers around the package's transaction-aware redemption
// primitives — callers already inside a tx (createOrder) don't need to know
// about walletLedger/orders/recordRedemptionDiscount wiring.
//
// No cap check on either: these SPEND coins, and spending can only move a
// balance away from the ceiling.
export async function lockAndQuoteCoinRedemption(
  tx: Tx,
  args: { userId: bigint; coins: number; rate: number; cap: number },
): Promise<{ coinsSpent: number; currencyValue: number }> {
  return lockAndQuoteRedemption(tx, { ...args, walletLedger, users });
}

export async function commitCoinRedemption(
  tx: Tx,
  args: { userId: bigint; coins: number; currencyValue: number; orderId: bigint; memo?: string },
): Promise<void> {
  await commitRedemption(tx, { ...args, walletLedger, orders, users, recordRedemptionDiscount });
}

/**
 * How long a checkout coin hold survives unsettled. The hold makes the wallet
 * balance drop the moment the order is placed; staff verification settles it.
 * If payment never arrives the hold lapses and the coins become spendable again
 * on their own — no sweep job, no reversal row. Generous on purpose: an
 * e-Transfer can take days to land and be verified, and a hold that expires
 * before verification leaves that order's coin discount unfunded.
 */
export const COIN_HOLD_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** Debit-with-expiry for a deferred-settlement order. Throws on insufficient
 *  balance, same as commit. */
export async function reserveCoinRedemption(
  tx: Tx,
  args: { userId: bigint; coins: number; currencyValue: number; orderId: bigint; ttlMs?: number },
): Promise<{ reservedUntil: number }> {
  return reserveRedemption(tx, {
    ...args,
    ttlMs: args.ttlMs ?? COIN_HOLD_TTL_MS,
    walletLedger,
    orders,
    users,
    recordRedemptionDiscount,
  });
}

/** Turn a live hold into a permanent debit. See the package for the three outcomes. */
export async function settleCoinReservation(
  tx: Tx,
  args: { userId: bigint; orderId: bigint },
): Promise<{ status: "settled" | "none" | "expired"; coins: number }> {
  return settleReservation(tx, { ...args, walletLedger, orders, users });
}

// App-bound wrapper for the package's award-reversal primitive — refundOrder
// (orders.service.ts) calls this to claw back order_activated coins.
export async function reverseCoinAward(
  tx: Tx,
  args: { userId: bigint; eventType: BusinessEvent; source: { type: string; id: string } },
): Promise<{ coinsReturned: number }> {
  return reverseAward(tx, { ...args, walletLedger, users });
}

/**
 * A coin hold lapsed before its payment was verified, so the coins went back to
 * the wallet while the order kept the coin-reduced price. Take them again (as
 * many as the customer still has, under their row lock) so a lapsed hold can't
 * fund a second order; the rest is reported for staff.
 */
export async function recollectLapsedCoins(
  tx: Tx,
  args: { userId: bigint; orderId: bigint; orderRef: string; coins: number },
): Promise<{ collected: number; notCollected: number }> {
  await tx.execute(sql`SELECT id FROM ${users} WHERE id = ${args.userId} FOR UPDATE`);
  const collected = Math.max(0, Math.min(await balanceInTx(tx, args.userId), args.coins));
  if (collected > 0) {
    await tx.insert(walletLedger).values({
      userId: args.userId,
      direction: "debit",
      sourceType: "redemption_late",
      sourceId: args.orderRef,
      orderId: args.orderId,
      coins: collected,
      memo: "Coins (hold lapsed before payment)",
    });
  }
  return { collected, notCollected: args.coins - collected };
}

/** Gives back the coins held or spent on an order (a hold is released, a spend is credited back). */
export function reverseCoinRedemption(tx: Tx, args: { userId: bigint; orderId: bigint }) {
  return reverseRedemption(tx, { ...args, walletLedger, orders, users });
}

/** Spendable balance read through the caller's tx (lapsed holds don't count). Take the user row lock first. */
async function balanceInTx(tx: Tx, userId: bigint): Promise<number> {
  const [row] = await tx
    .select({
      bal: sql<number>`coalesce(sum(case when ${walletLedger.direction} = 'credit' then ${walletLedger.coins} else -${walletLedger.coins} end), 0)::int`,
    })
    .from(walletLedger)
    .where(and(eq(walletLedger.userId, userId), unexpired(walletLedger, Date.now())));
  return row?.bal ?? 0;
}

type AwardableOrder = Pick<typeof orders.$inferSelect, "id" | "publicId" | "deploymentId" | "userId" | "total" | "pricingSnapshot">;

/**
 * Credits a paid order's earn-back coins inside the caller's transaction, so
 * coins commit or roll back with the payment. Never throws for a business
 * reason: a cap or a missing coin value skips the award and leaves a note on
 * the order instead of blocking the payment. Same key as the old award, so
 * cancel/refund clawback (reverseCoinAward) is unchanged.
 */
export async function awardOrderCoins(
  tx: Tx,
  order: AwardableOrder,
  paymentStatus: string | null,
): Promise<{ coins: number; skipped?: "unpaid" | "off" | "no_rate" | "cap" | "already" }> {
  if (order.userId == null || !earnsOrderCoins({ total: order.total, paymentStatus })) return { coins: 0, skipped: "unpaid" };
  const pct = await getCoinEarnPct();
  if (pct <= 0) return { coins: 0, skipped: "off" };

  const note = (text: string) => tx.insert(orderActivities).values({ orderId: order.id, type: "note", note: text });
  const { currency } = await getAppSettings();
  let rate: number;
  try {
    rate = await baseWalletService.activeRate(currency);
  } catch (e) {
    if (!(e instanceof ValidationError)) throw e;
    await note(`No coins earned: no coin value set for ${currency}`);
    return { coins: 0, skipped: "no_rate" };
  }
  const snap = order.pricingSnapshot as OrderPricingSnapshot;
  const coins = earnCoins({ total: Number(order.total), taxTotal: snap.taxTotal ?? 0, pct, valuePerCoin: rate });
  if (coins <= 0) return { coins: 0, skipped: "off" };

  await tx.execute(sql`SELECT id FROM ${users} WHERE id = ${order.userId} FOR UPDATE`);
  const cap = await getMaxWalletBalance();
  if (cap !== null && (await balanceInTx(tx, order.userId)) + coins > cap) {
    await note(`No coins earned: wallet cap reached (${coins} coins skipped)`);
    return { coins: 0, skipped: "cap" };
  }
  const res = await tx
    .insert(walletLedger)
    .values({
      userId: order.userId,
      direction: "credit",
      eventType: "order_activated",
      sourceType: "order",
      sourceId: order.publicId,
      orderId: order.id,
      coins,
      memo: `Earned ${pct}% on order ${order.deploymentId}`,
    })
    .onConflictDoNothing({ target: [walletLedger.sourceType, walletLedger.sourceId, walletLedger.eventType] })
    .returning({ id: walletLedger.id });
  return res.length > 0 ? { coins } : { coins: 0, skipped: "already" };
}
