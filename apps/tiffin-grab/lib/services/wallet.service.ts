import {
  createWalletService,
  commitRedemption,
  lockAndQuoteRedemption,
  reverseAward,
  unexpired,
  type WalletDeps,
  type WalletTx as PackageWalletTx,
} from "@realm/wallet";
import { and, eq, inArray, notExists, sql } from "drizzle-orm";
import { ValidationError } from "@realm/commons";
import { db } from "@/db/client";
import { coinRate, durationPackages, eventPayout, ledgerEntries, mealPayout, mealSizes, orders, users, walletLedger } from "@/db/schema";
import { getMaxWalletBalance } from "./app-settings.service";

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

// True if crediting `coins` to userId wouldn't push their balance past the
// admin-configured wallet cap (Coin Rate page; NULL = unlimited). Hard block,
// not a partial top-up — a blocked award credits nothing. Wired into the
// shared package's award() via canAward below, and reused directly by the
// tiffin-grab-specific bulk award paths (Meal Payouts, Customer Payouts).
async function capRoom(userId: bigint, coins: number): Promise<boolean> {
  const cap = await getMaxWalletBalance();
  if (cap === null) return true;
  const balance = await baseWalletService.balance(userId);
  return balance + coins <= cap;
}

// Batch version of capRoom for the bulk award paths — one query for every
// candidate's balance instead of N+1.
async function filterUnderCap(userIds: bigint[], coins: number): Promise<{ ok: bigint[]; capped: bigint[] }> {
  if (userIds.length === 0) return { ok: [], capped: [] };
  const cap = await getMaxWalletBalance();
  if (cap === null) return { ok: userIds, capped: [] };

  const balances = await db
    .select({
      userId: walletLedger.userId,
      balance: sql<number>`coalesce(sum(case when ${walletLedger.direction} = 'credit' then ${walletLedger.coins} else -${walletLedger.coins} end), 0)::int`,
    })
    .from(walletLedger)
    // Same predicate walletService.balance() uses — without it a live hold
    // reads as spent here and the two disagree about the same wallet.
    .where(and(inArray(walletLedger.userId, userIds), unexpired(walletLedger, Date.now())))
    .groupBy(walletLedger.userId);
  const balanceByUser = new Map(balances.map((b) => [b.userId, b.balance]));

  const ok: bigint[] = [];
  const capped: bigint[] = [];
  for (const userId of userIds) {
    const balance = balanceByUser.get(userId) ?? 0;
    (balance + coins <= cap ? ok : capped).push(userId);
  }
  return { ok, capped };
}

// The original class-based wallet.service.ts folded balance/ledgerPage/award/
// recentTransactions/earnSpendTotals/moneyValue/activeRate/redeem into the
// shared @realm/wallet package (createWalletService) — puchkaman reuses the
// same factory. Only the tiffin-grab-specific pieces (the wallet cap, Meal
// Payouts) stay here, layered on top via canAward + object spread below.
const baseWalletService = createWalletService<BusinessEvent>({
  db,
  tables: { walletLedger, eventPayout, coinRate },
  orders,
  users,
  recordRedemptionDiscount,
  canAward: capRoom,
});

// Called whenever an admin saves a Meal Payouts rule (Wallet → Payouts):
// one-time award to every currently-active order the rule matches. An
// override matches on exact (mealSizeId, durationWeeks); the default rule
// (both NULL) matches every active order that no override matches.
//
// Idempotency is enforced here, not via wallet_ledger's unique index: this
// doesn't go through award()/appEvent (a matrix of override rules doesn't
// fit event_payout's one-row-per-fixed-event shape, and adding a new
// appEvent value would spawn a confusing extra toggle in the *existing*
// Event Payouts grid, which auto-seeds one row per enum value). Instead
// sourceType="meal_payout" + sourceId="<rule publicId>:<order publicId>"
// with eventType left NULL — but Postgres treats NULL as distinct in a
// unique index, so onConflictDoNothing would NOT actually block a repeat
// insert here. Existing sourceIds are checked explicitly before inserting.
//
// Matches per ORDER, not deduped per user — same shape award() already
// uses for order_activated, so a customer with two matching active orders
// is paid twice, consistent with the rest of the wallet.
async function awardMealPayoutRule(ruleId: bigint): Promise<{ matched: number; awarded: number; coinsPerCustomer: number; capped: number }> {
  const [rule] = await db.select().from(mealPayout).where(eq(mealPayout.id, ruleId)).limit(1);
  if (!rule) throw new ValidationError("Payout rule not found");
  if (rule.coins <= 0) return { matched: 0, awarded: 0, coinsPerCustomer: rule.coins, capped: 0 };

  let matches: { id: bigint; publicId: string; userId: bigint | null }[];
  let memo: string;

  if (rule.mealSizeId !== null && rule.durationPackageId !== null) {
    const [duration] = await db.select({ weeks: durationPackages.weeks })
      .from(durationPackages).where(eq(durationPackages.id, rule.durationPackageId)).limit(1);
    if (!duration) throw new ValidationError("Duration package not found");
    const [size] = await db.select({ name: mealSizes.name })
      .from(mealSizes).where(eq(mealSizes.id, rule.mealSizeId)).limit(1);
    memo = `Meal payout: ${size?.name ?? "meal size"} · ${duration.weeks} weeks`;

    matches = await db
      .select({ id: orders.id, publicId: orders.publicId, userId: orders.userId })
      .from(orders)
      .where(and(
        eq(orders.status, "active"),
        eq(orders.mealSizeId, rule.mealSizeId),
        eq(orders.durationWeeks, duration.weeks),
      ));
  } else {
    memo = "Meal payout: default rule";
    matches = await db
      .select({ id: orders.id, publicId: orders.publicId, userId: orders.userId })
      .from(orders)
      .where(and(
        eq(orders.status, "active"),
        notExists(
          db.select({ one: mealPayout.id }).from(mealPayout)
            .innerJoin(durationPackages, eq(durationPackages.id, mealPayout.durationPackageId))
            .where(and(
              eq(mealPayout.mealSizeId, orders.mealSizeId),
              eq(durationPackages.weeks, orders.durationWeeks),
            )),
        ),
      ));
  }

  // Guest/legacy orders with no userId can't hold a wallet balance.
  const eligible = matches.filter((o): o is typeof matches[number] & { userId: bigint } => o.userId !== null);
  if (eligible.length === 0) return { matched: matches.length, awarded: 0, coinsPerCustomer: rule.coins, capped: 0 };

  const sourceIdFor = (orderPublicId: string) => `${rule.publicId}:${orderPublicId}`;
  const already = await db
    .select({ sourceId: walletLedger.sourceId })
    .from(walletLedger)
    .where(and(
      eq(walletLedger.sourceType, "meal_payout"),
      inArray(walletLedger.sourceId, eligible.map((o) => sourceIdFor(o.publicId))),
    ));
  const alreadyAwarded = new Set(already.map((a) => a.sourceId));

  const toAward = eligible.filter((o) => !alreadyAwarded.has(sourceIdFor(o.publicId)));
  if (toAward.length === 0) return { matched: matches.length, awarded: 0, coinsPerCustomer: rule.coins, capped: 0 };

  // Cap check is per order, keyed by userId — a customer with two matching
  // orders can have one go through and the second blocked once they cross
  // the ceiling, same "hard block, per-customer" semantics as everywhere else.
  const { ok, capped } = await filterUnderCap(toAward.map((o) => o.userId), rule.coins);
  const okSet = new Set(ok);
  const toInsert = toAward.filter((o) => okSet.has(o.userId));
  if (toInsert.length === 0) return { matched: matches.length, awarded: 0, coinsPerCustomer: rule.coins, capped: capped.length };

  await db.insert(walletLedger).values(
    toInsert.map((o) => ({
      userId: o.userId,
      direction: "credit" as const,
      sourceType: "meal_payout",
      sourceId: sourceIdFor(o.publicId),
      coins: rule.coins,
      orderId: o.id,
      memo,
    })),
  );

  return { matched: matches.length, awarded: toInsert.length, coinsPerCustomer: rule.coins, capped: capped.length };
}

export const walletService = {
  ...baseWalletService,
  capRoom,
  filterUnderCap,
  awardMealPayoutRule,
};

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

// App-bound wrapper for the package's award-reversal primitive — refundOrder
// (orders.service.ts) calls this to claw back order_activated coins.
export async function reverseCoinAward(
  tx: Tx,
  args: { userId: bigint; eventType: BusinessEvent; source: { type: string; id: string } },
): Promise<{ coinsReturned: number }> {
  return reverseAward(tx, { ...args, walletLedger, users });
}
