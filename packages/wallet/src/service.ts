import { and, desc, eq, sql } from "drizzle-orm";
import type { PostgresJsTransaction } from "drizzle-orm/postgres-js";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import { ValidationError } from "@realm/commons";
import type { Condition } from "@realm/commons/model/condition";
import type { Page, PageRequest } from "@realm/commons/util/pagination";
import { conditionToSql, columnResolver, type Database } from "@realm/database";
import type { WalletTables } from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = PostgresJsTransaction<any, any>;

export type WalletTx<E extends string> = {
  publicId: string;
  direction: "credit" | "debit";
  coins: number;
  eventType: E | null;
  sourceType: string;
  sourceId: string;
  memo: string | null;
  createdAt: number;
  orderPublicId: string | null;
};

/**
 * `E` is left for TS to infer from `tables` (the app's real
 * `makeWalletTables` return value carries its real event union) — a
 * consumer who passes real tables gets a real union, not `string`. Explicit
 * type arguments still work; they're just no longer required for safety.
 */
export type WalletDeps<E extends string> = {
  db: Database;
  tables: WalletTables<E>;
  /** Joined for orderPublicId; app-local, so injected. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  orders: AnyPgTable & { id: any; publicId: any };
  /** Locked FOR UPDATE to serialise redemptions. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  users: AnyPgTable & { id: any };
  /**
   * Writes the app's own money-ledger discount row inside redeem's transaction.
   * Injected because ledger_entries differs per app and the package must not
   * name an app-local table.
   */
  recordRedemptionDiscount: (
    tx: Tx,
    args: { userId: bigint; orderId: bigint; amount: string; memo: string },
  ) => Promise<void>;
  /**
   * Optional hard cap on how many coins a wallet may hold. Checked in award()
   * right after the existing enabled/zero-coins no-op check, before the
   * insert — a blocked award returns false the same way those no-ops already
   * do, so callers never see a shape change. Omit for apps with no cap
   * (the default — award() behaves exactly as before this was added).
   */
  canAward?: (userId: bigint, coins: number) => Promise<boolean>;
};

/**
 * The double-cap: for a non-round rate, coinsSpent * rate can exceed
 * order.total after rounding, so the cap is re-applied post-recompute rather
 * than trusted as redundant.
 */
export function capRedemption(
  coins: number,
  rate: number,
  orderTotal: number,
): { coinsSpent: number; currencyValue: number } {
  let currencyValue = Math.min(coins * rate, orderTotal);
  const coinsSpent = Math.round(currencyValue / rate);
  // Re-apply cap after recompute: for non-round rates, coinsSpent*rate can exceed order.total
  currencyValue = Math.min(Number((coinsSpent * rate).toFixed(2)), orderTotal);
  return { coinsSpent, currencyValue };
}

/**
 * Re-entrant by design: Postgres row locks are held by the TRANSACTION, so a
 * second `FOR UPDATE` on a row this tx already locked returns immediately
 * without blocking. That is what lets `commitRedemption` re-take the user
 * lock unconditionally even on the create path, where `lockAndQuoteRedemption`
 * already took it in the same tx.
 */
async function lockUser(tx: Tx, users: AnyPgTable & { id: unknown }, userId: bigint): Promise<void> {
  await tx.execute(sql`SELECT id FROM ${users} WHERE id = ${userId} FOR UPDATE`);
}

async function readBalance(
  tx: Tx,
  walletLedger: WalletTables<string>["walletLedger"],
  userId: bigint,
): Promise<number> {
  const [row] = await tx
    .select({
      bal: sql<number>`coalesce(sum(case when ${walletLedger.direction} = 'credit' then ${walletLedger.coins} else -${walletLedger.coins} end), 0)::int`,
    })
    .from(walletLedger)
    .where(eq(walletLedger.userId, userId));
  return row?.bal ?? 0;
}

/**
 * Takes the per-user `FOR UPDATE` lock, re-reads the balance under it, and
 * caps the redemption. Split out so a caller already inside a transaction
 * (e.g. checkout's `createOrder`) can run this on its own `tx` instead of
 * nesting `redeem()`'s own transaction.
 *
 * This lock only guards the balance read (TOCTOU) — it is per-USER, so it
 * cannot serialise two different users redeeming against the same order.
 * The per-order duplicate guard and the authoritative pre-write balance
 * re-assert both live in `commitRedemption`, not here — this quote writes
 * nothing, so its balance check expires with the transaction and is only ever
 * an early, friendlier rejection. Lock order across the package is fixed as
 * user-then-order; `commitRedemption` takes both itself in that order, so no
 * call path can take them in the opposite order and deadlock.
 */
export async function lockAndQuoteRedemption(
  tx: Tx,
  args: { userId: bigint; coins: number; rate: number; cap: number; walletLedger: WalletTables<string>["walletLedger"]; users: AnyPgTable & { id: unknown } },
): Promise<{ coinsSpent: number; currencyValue: number }> {
  const { userId, coins, rate, cap, walletLedger, users } = args;

  // ponytail: per-user row lock serializes redemptions; fine at current scale, revisit if redemption throughput becomes hot.
  await lockUser(tx, users, userId);

  // Authoritative balance check inside the locked txn to prevent TOCTOU double-spend
  const balance = await readBalance(tx, walletLedger, userId);

  if (coins <= 0) throw new ValidationError("coins must be positive");
  if (coins > balance) throw new ValidationError("insufficient coins");

  return capRedemption(coins, rate, cap);
}

/**
 * The duplicate-redemption guard. Not exported: it is only ever safe to run
 * immediately after the order row is locked, and `commitRedemption` is the
 * only place that holds that lock — a standalone export would just invite
 * the exact bug this file already shipped once (check run before the lock
 * that is supposed to make it authoritative).
 */
async function assertNotAlreadyRedeemed(
  tx: Tx,
  orderId: bigint,
  walletLedger: WalletTables<string>["walletLedger"],
): Promise<void> {
  const [existing] = await tx.select({ id: walletLedger.id })
    .from(walletLedger)
    .where(and(eq(walletLedger.sourceType, "redemption"), eq(walletLedger.sourceId, orderId.toString())))
    .limit(1);
  if (existing) throw new ValidationError("coins already redeemed for this order");
}

/**
 * Writes the debit ledger row and the app's own discount ledger row inside
 * the caller's `tx`. Fully self-guarding: it takes BOTH locks itself, runs the
 * per-order duplicate check, and re-asserts the balance before writing, so a
 * caller cannot skip a guard, run one on the wrong `tx`, or call one in the
 * wrong order relative to the locks.
 *
 * Why it must re-assert rather than trust a quote: `lockAndQuoteRedemption`'s
 * balance check dies with the transaction it ran in and writes nothing. On a
 * DEFERRED path (tiffin-grab e-Transfer, puchkaman's webhook-primary Clover
 * flow) the quote is taken at order creation and committed at payment
 * verification — a different transaction, minutes or days later, after which
 * the same balance may have been spent by another order. Without this
 * re-assert one balance can fund two orders. The per-order dedupe cannot
 * catch that: two orders are two legitimate redemptions by construction.
 *
 * Lock order is user-then-order on EVERY path, taken here unconditionally
 * rather than assumed from the caller (`verifyPayment` never calls the quote
 * and so holds no user lock on entry). Re-locking a row the tx already holds
 * is a no-op in Postgres, so the create path — which does hold the user lock
 * from the quote, and whose order row it just INSERTed in this same tx —
 * pays nothing and cannot deadlock against itself.
 */
export async function commitRedemption(
  tx: Tx,
  args: {
    userId: bigint;
    coins: number;
    currencyValue: number;
    orderId: bigint;
    memo?: string;
    walletLedger: WalletTables<string>["walletLedger"];
    orders: AnyPgTable & { id: unknown };
    users: AnyPgTable & { id: unknown };
    recordRedemptionDiscount: WalletDeps<string>["recordRedemptionDiscount"];
  },
): Promise<void> {
  const { userId, coins, currencyValue, orderId, memo, walletLedger, orders, users, recordRedemptionDiscount } = args;

  await lockUser(tx, users, userId);
  // Per-order lock: serialises two redemptions against the same order even
  // when they belong to two different users (and thus took two different,
  // non-conflicting per-user locks above).
  await tx.execute(sql`SELECT id FROM ${orders} WHERE id = ${orderId} FOR UPDATE`);
  await assertNotAlreadyRedeemed(tx, orderId, walletLedger);

  // The dedupe above proves this order has no debit yet, so the balance read
  // under the user lock is exactly what is available to fund this redemption.
  // Fail loudly: the alternative — skipping the debit — would leave the
  // order's already-applied discount unfunded and silently invent money.
  const balance = await readBalance(tx, walletLedger, userId);
  if (coins > balance) {
    throw new ValidationError(
      `insufficient coins to settle redemption for order ${orderId}: balance ${balance}, need ${coins}`,
    );
  }

  await tx.insert(walletLedger).values({
    userId,
    direction: "debit",
    sourceType: "redemption",
    sourceId: orderId.toString(),
    coins,
    orderId,
    memo: memo ?? "checkout redemption",
  });
  await recordRedemptionDiscount(tx, {
    userId,
    orderId,
    amount: currencyValue.toFixed(2),
    memo: "coin redemption",
  });
}

/**
 * Reverses a redemption previously written by `commitRedemption`: credits
 * back the same coin count against the same order. Mirrors `commitRedemption`
 * exactly opposite direction, same fixed user-then-order lock order, same
 * dedupe-by-query approach (there is no DB constraint doing this for us — the
 * unique index on wallet_ledger is `(source_type, source_id, event_type)` and
 * `event_type` is NULL on every spend/reversal row, and Postgres treats
 * distinct NULLs as non-equal for uniqueness purposes, so nothing at the DB
 * layer stops a second reversal row; the lock plus this query is the only
 * guard).
 *
 * Idempotent: a redemption debit not found is a silent no-op (nothing to
 * reverse), and a reversal already recorded for this order is also a silent
 * no-op (already returned once) — neither writes nor throws.
 *
 * Does NOT touch the app's `ledger_entries` (or any other app-local money
 * table): that table has per-app columns and this package must not name it.
 * This only returns the coin count that was credited back; the caller
 * decides what money-ledger row, if any, to write in response.
 */
export async function reverseRedemption(
  tx: Tx,
  args: {
    userId: bigint;
    orderId: bigint;
    walletLedger: WalletTables<string>["walletLedger"];
    orders: AnyPgTable & { id: unknown };
    users: AnyPgTable & { id: unknown };
  },
): Promise<{ coinsReturned: number }> {
  const { userId, orderId, walletLedger, orders, users } = args;

  await lockUser(tx, users, userId);
  // Per-order lock: same reason as commitRedemption — serialises concurrent
  // reversal/commit attempts against the same order.
  await tx.execute(sql`SELECT id FROM ${orders} WHERE id = ${orderId} FOR UPDATE`);

  // Scoped to the user we are about to credit. Today's callers provably resolve
  // owner and order to the same row, but that invariant lives entirely in them —
  // this is a shared primitive, and an unscoped lookup would happily read one
  // user's debit and credit the coins to another. Correct callers see no change.
  const [debit] = await tx
    .select({ coins: walletLedger.coins })
    .from(walletLedger)
    .where(and(
      eq(walletLedger.userId, userId),
      eq(walletLedger.sourceType, "redemption"),
      eq(walletLedger.sourceId, orderId.toString()),
    ))
    .limit(1);
  if (!debit) return { coinsReturned: 0 };

  // Deliberately NOT user-scoped: a reversal recorded by anyone for this order
  // must block a second one. Narrowing this would be the double-credit bug.

  const [existingReversal] = await tx
    .select({ id: walletLedger.id })
    .from(walletLedger)
    .where(and(eq(walletLedger.sourceType, "redemption_reversal"), eq(walletLedger.sourceId, orderId.toString())))
    .limit(1);
  if (existingReversal) return { coinsReturned: 0 };

  await tx.insert(walletLedger).values({
    userId,
    direction: "credit",
    sourceType: "redemption_reversal",
    sourceId: orderId.toString(),
    coins: debit.coins,
    orderId,
    memo: `reverses redemption for order ${orderId}`,
  });

  return { coinsReturned: debit.coins };
}

export function createWalletService<E extends string>(deps: WalletDeps<E>) {
  const { db, tables, orders, users, recordRedemptionDiscount, canAward } = deps;
  const { walletLedger, eventPayout, coinRate } = tables;

  async function activeRate(currency: string): Promise<number> {
    const [row] = await db
      .select({ v: coinRate.valuePerCoin })
      .from(coinRate)
      .where(eq(coinRate.currency, currency))
      .orderBy(desc(coinRate.createdAt))
      .limit(1);
    if (!row) throw new ValidationError(`No coin rate for ${currency}`);
    return Number(row.v);
  }

  return {
    async balance(userId: bigint): Promise<number> {
      const [row] = await db
        .select({
          bal: sql<number>`coalesce(sum(case when ${walletLedger.direction} = 'credit' then ${walletLedger.coins} else -${walletLedger.coins} end), 0)::int`,
        })
        .from(walletLedger)
        .where(eq(walletLedger.userId, userId));
      return row?.bal ?? 0;
    },

    async ledgerPage(
      userId: bigint,
      condition: Condition | undefined,
      page: PageRequest,
    ): Promise<Page<WalletTx<E>>> {
      const facet = conditionToSql(condition, columnResolver({
        direction: walletLedger.direction,
        eventType: walletLedger.eventType,
        createdAt: walletLedger.createdAt,
        memo: walletLedger.memo,
      }));
      // userId scope is NOT user-controllable — AND it with the facet condition.
      const where = facet ? and(eq(walletLedger.userId, userId), facet) : eq(walletLedger.userId, userId);
      const rows = await db
        .select({
          publicId: walletLedger.publicId, direction: walletLedger.direction, coins: walletLedger.coins,
          eventType: walletLedger.eventType, sourceType: walletLedger.sourceType, sourceId: walletLedger.sourceId,
          memo: walletLedger.memo, createdAt: walletLedger.createdAt, orderPublicId: orders.publicId,
        })
        .from(walletLedger)
        .leftJoin(orders, eq(walletLedger.orderId, orders.id))
        .where(where)
        .orderBy(desc(walletLedger.createdAt))
        .limit(page.size).offset(page.page * page.size);
      const [{ count }] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(walletLedger).where(where);
      return {
        // eventType cast: drizzle's SelectResultField conditional can't collapse
        // an abstract generic PgEnumColumn['data'] inside this generic function
        // body (E is opaque here even though it's concrete at every call site) —
        // a real, narrow TS limitation, not a select-shape assumption.
        items: rows.map((r) => ({ ...r, eventType: r.eventType as E | null, orderPublicId: r.orderPublicId ?? null })),
        page: page.page,
        size: page.size,
        total: count,
      };
    },

    async award(
      userId: bigint,
      eventType: E,
      source: { type: string; id: string },
      memo?: string,
    ): Promise<boolean> {
      const [cfg] = await db
        .select()
        .from(eventPayout)
        .where(eq(eventPayout.eventType, eventType))
        .limit(1);
      if (!cfg?.enabled || cfg.coins <= 0) return false;
      if (canAward && !(await canAward(userId, cfg.coins))) return false;
      const res = await db
        .insert(walletLedger)
        .values({
          userId,
          direction: "credit",
          eventType,
          sourceType: source.type,
          sourceId: source.id,
          coins: cfg.coins,
          memo,
        })
        .onConflictDoNothing({ target: [walletLedger.sourceType, walletLedger.sourceId, walletLedger.eventType] })
        .returning({ id: walletLedger.id });
      return res.length > 0;
    },

    async recentTransactions(userId: bigint, limit = 10): Promise<WalletTx<E>[]> {
      const rows = await db
        .select({
          publicId: walletLedger.publicId,
          direction: walletLedger.direction,
          coins: walletLedger.coins,
          eventType: walletLedger.eventType,
          sourceType: walletLedger.sourceType,
          sourceId: walletLedger.sourceId,
          memo: walletLedger.memo,
          createdAt: walletLedger.createdAt,
          orderPublicId: orders.publicId,
        })
        .from(walletLedger)
        .leftJoin(orders, eq(orders.id, walletLedger.orderId))
        .where(eq(walletLedger.userId, userId))
        .orderBy(desc(walletLedger.createdAt))
        .limit(limit);
      // eventType cast: same drizzle/TS limitation as ledgerPage above.
      return rows.map((r) => ({ ...r, eventType: r.eventType as E | null }));
    },

    async earnSpendTotals(userId: bigint): Promise<{ earned: number; spent: number }> {
      const coinsIf = (dir: "credit" | "debit") =>
        sql<number>`cast(coalesce(sum(case when ${walletLedger.direction} = ${dir} then ${walletLedger.coins} else 0 end), 0) as int)`;
      const [agg] = await db.select({ earned: coinsIf("credit"), spent: coinsIf("debit") })
        .from(walletLedger).where(eq(walletLedger.userId, userId));
      return { earned: agg.earned, spent: agg.spent };
    },

    // Display-only money value. activeRate throws when a currency has no coin_rate
    // row; degrade to null so the wallet renders coins-only instead of 500ing.
    async moneyValue(coins: number, currency: string): Promise<number | null> {
      try {
        const rate = await activeRate(currency);
        return Number((coins * rate).toFixed(2));
      } catch {
        return null;
      }
    },

    activeRate,

    async redeem(
      userId: bigint,
      coins: number,
      order: { id: bigint; total: number; currency: string },
    ): Promise<{ coinsSpent: number; currencyValue: number }> {
      // Fast fail: cheap pre-validation before opening a txn
      if (coins <= 0) throw new ValidationError("coins must be positive");

      const rate = await activeRate(order.currency);

      return db.transaction(async (tx) => {
        const { coinsSpent, currencyValue } = await lockAndQuoteRedemption(tx, {
          userId,
          coins,
          rate,
          cap: order.total,
          walletLedger,
          users,
        });

        await commitRedemption(tx, {
          userId,
          coins: coinsSpent,
          currencyValue,
          orderId: order.id,
          walletLedger,
          orders,
          users,
          recordRedemptionDiscount,
        });
        return { coinsSpent, currencyValue };
      });
    },
  };
}
