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
 * Takes the per-user `FOR UPDATE` lock, re-reads the balance under it, and
 * caps the redemption. Split out so a caller already inside a transaction
 * (e.g. checkout's `createOrder`) can run this on its own `tx` instead of
 * nesting `redeem()`'s own transaction.
 *
 * This lock only guards the balance read (TOCTOU) — it is per-USER, so it
 * cannot serialise two different users redeeming against the same order.
 * The per-order duplicate guard lives in `commitRedemption`, not here. Lock
 * order across the package is fixed as user-then-order (this function locks
 * the user; `commitRedemption` locks the order next) so no two call paths
 * can ever take the two locks in opposite orders and deadlock.
 */
export async function lockAndQuoteRedemption(
  tx: Tx,
  args: { userId: bigint; coins: number; rate: number; cap: number; walletLedger: WalletTables<string>["walletLedger"]; users: AnyPgTable & { id: unknown } },
): Promise<{ coinsSpent: number; currencyValue: number }> {
  const { userId, coins, rate, cap, walletLedger, users } = args;

  // ponytail: per-user row lock serializes redemptions; fine at current scale, revisit if redemption throughput becomes hot.
  await tx.execute(sql`SELECT id FROM ${users} WHERE id = ${userId} FOR UPDATE`);

  // Authoritative balance check inside the locked txn to prevent TOCTOU double-spend
  const [balRow] = await tx
    .select({
      bal: sql<number>`coalesce(sum(case when ${walletLedger.direction} = 'credit' then ${walletLedger.coins} else -${walletLedger.coins} end), 0)::int`,
    })
    .from(walletLedger)
    .where(eq(walletLedger.userId, userId));
  const balance = balRow?.bal ?? 0;

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
 * the caller's `tx`. Self-guarding: takes the order row's `FOR UPDATE` lock
 * and runs the duplicate check itself, so a caller cannot skip it, run it on
 * the wrong `tx`, or call it in the wrong order relative to the lock — the
 * check is no longer a caller responsibility at all.
 *
 * Locks user-then-order (see `lockAndQuoteRedemption`): by the time a caller
 * reaches `commitRedemption` it has already called `lockAndQuoteRedemption`
 * and holds the user lock, so this is always the second lock taken. For
 * checkout's `createOrder`, the order row was just INSERTed in this same
 * `tx`, so it's already exclusively held — this lock costs nothing there.
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
    recordRedemptionDiscount: WalletDeps<string>["recordRedemptionDiscount"];
  },
): Promise<void> {
  const { userId, coins, currencyValue, orderId, memo, walletLedger, orders, recordRedemptionDiscount } = args;

  // Per-order lock: serialises two redemptions against the same order even
  // when they belong to two different users (and thus took two different,
  // non-conflicting per-user locks in lockAndQuoteRedemption).
  await tx.execute(sql`SELECT id FROM ${orders} WHERE id = ${orderId} FOR UPDATE`);
  await assertNotAlreadyRedeemed(tx, orderId, walletLedger);

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

export function createWalletService<E extends string>(deps: WalletDeps<E>) {
  const { db, tables, orders, users, recordRedemptionDiscount } = deps;
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
          recordRedemptionDiscount,
        });
        return { coinsSpent, currencyValue };
      });
    },
  };
}
