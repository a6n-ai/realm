import { and, desc, eq, sql } from "drizzle-orm";
import type { PostgresJsTransaction } from "drizzle-orm/postgres-js";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import { ValidationError } from "@foundry/commons";
import type { Condition } from "@foundry/commons/model/condition";
import type { Page, PageRequest } from "@foundry/commons/util/pagination";
import { conditionToSql, columnResolver, type Database } from "@foundry/database";
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

/**
 * Every read of "what does this wallet hold" filters on this: a debit whose
 * `reserved_until` has passed was a hold that nobody ever settled, so it
 * never spent anything. Committed rows (`reserved_until is null`) and live
 * holds both count — a live hold is money already promised to an order, and
 * showing it as spendable is exactly the double-spend this column exists to
 * stop. Expiry is therefore self-releasing: no sweep job, no reversal row.
 *
 * Exported because apps run their own aggregate queries straight off
 * `wallet_ledger` (bulk cap checks, admin stat cards) that this package never
 * sees. Those must reuse this predicate, not re-spell it — two spellings of
 * "what counts" is how one of them silently drifts from `balance()`.
 */
export function unexpired(
  walletLedger: WalletTables<string>["walletLedger"],
  now: number,
) {
  return sql`(${walletLedger.reservedUntil} is null or ${walletLedger.reservedUntil} > ${now})`;
}

async function readBalance(
  tx: Tx,
  walletLedger: WalletTables<string>["walletLedger"],
  userId: bigint,
  now: number = Date.now(),
): Promise<number> {
  const [row] = await tx
    .select({
      bal: sql<number>`coalesce(sum(case when ${walletLedger.direction} = 'credit' then ${walletLedger.coins} else -${walletLedger.coins} end), 0)::int`,
    })
    .from(walletLedger)
    .where(and(eq(walletLedger.userId, userId), unexpired(walletLedger, now)));
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
 * Reservation-at-quote: the same debit `commitRedemption` writes, but held
 * rather than spent — `reserved_until` is stamped `ttlMs` into the future.
 *
 * Why this exists (the design this replaces): on a deferred-settlement path
 * the quote is taken at order creation and the debit committed minutes or
 * days later. Committing the debit up front means every abandoned order needs
 * an explicit undo — `reverseRedemption` plus, in the app, a mirroring
 * money-ledger adjustment row — and every path that can fail terminally has to
 * remember to call it. NOT committing anything up front is worse: the balance
 * check dies with the quote's transaction, so the same coins can fund a second
 * order and settlement then fails with the customer's money already taken.
 *
 * A hold is the third option, and the only one with no cleanup: it counts
 * against the balance immediately (so nothing else can spend it) and, if the
 * order is never settled, it simply stops counting when `reserved_until`
 * passes. Nothing runs. Nothing writes. `terminalizeAbandonedOrders`'s
 * doc-comment calls this shape out by name: "releasing an expired reservation
 * replaces reversing a committed debit, and the mirroring ledger adjustment
 * row goes with it".
 *
 * Same guards, same fixed user-then-order lock order and the same per-order
 * dedupe as `commitRedemption` — a hold is a real row, and two of them against
 * one order would be the same double-spend. The dedupe does not exempt expired
 * holds: one order gets one redemption, ever, exactly as today.
 *
 * The app's discount ledger row IS written here, not at settlement: the order's
 * quoted total already carries the discount from this moment on, and the money
 * ledger has to say so. An unsettled order's discount is reversed by whatever
 * already reverses that order's money, not by this package.
 */
export async function reserveRedemption(
  tx: Tx,
  args: {
    userId: bigint;
    coins: number;
    currencyValue: number;
    orderId: bigint;
    /** How long the hold survives unsettled. */
    ttlMs: number;
    now?: number;
    memo?: string;
    walletLedger: WalletTables<string>["walletLedger"];
    orders: AnyPgTable & { id: unknown };
    users: AnyPgTable & { id: unknown };
    recordRedemptionDiscount: WalletDeps<string>["recordRedemptionDiscount"];
  },
): Promise<{ reservedUntil: number }> {
  const { userId, coins, currencyValue, orderId, ttlMs, memo, walletLedger, orders, users, recordRedemptionDiscount } = args;
  const now = args.now ?? Date.now();
  if (ttlMs <= 0) throw new ValidationError("reservation ttl must be positive");
  if (coins <= 0) throw new ValidationError("coins must be positive");

  await lockUser(tx, users, userId);
  await tx.execute(sql`SELECT id FROM ${orders} WHERE id = ${orderId} FOR UPDATE`);
  await assertNotAlreadyRedeemed(tx, orderId, walletLedger);

  const balance = await readBalance(tx, walletLedger, userId, now);
  if (coins > balance) {
    throw new ValidationError(
      `insufficient coins to reserve redemption for order ${orderId}: balance ${balance}, need ${coins}`,
    );
  }

  const reservedUntil = now + ttlMs;
  await tx.insert(walletLedger).values({
    userId,
    direction: "debit",
    sourceType: "redemption",
    sourceId: orderId.toString(),
    coins,
    orderId,
    memo: memo ?? "checkout redemption (reserved)",
    reservedUntil,
  });
  await recordRedemptionDiscount(tx, {
    userId,
    orderId,
    amount: currencyValue.toFixed(2),
    memo: "coin redemption",
  });

  return { reservedUntil };
}

/**
 * Commits a hold taken by `reserveRedemption` — one UPDATE nulling
 * `reserved_until`, no second ledger row. Call it when the order is paid.
 *
 * Three outcomes, all of which the caller must handle explicitly rather than
 * getting a silent boolean:
 *
 *   "settled"  — the hold was live and is now a permanent debit.
 *   "none"     — this order never reserved anything (or was already settled;
 *                a settled row is indistinguishable from a plain committed
 *                debit BY DESIGN, which is what makes a repeat call a no-op).
 *   "expired"  — the hold lapsed before the money landed. NOT settled, and
 *                deliberately not force-settled either: the coins have been
 *                spendable since it lapsed and may already be gone. This is
 *                the reservation-era twin of "settling an order whose coins
 *                were already returned" — the caller decides (refuse, alert,
 *                re-charge), because only the caller knows what the customer
 *                was actually charged.
 */
export async function settleReservation(
  tx: Tx,
  args: {
    userId: bigint;
    orderId: bigint;
    now?: number;
    walletLedger: WalletTables<string>["walletLedger"];
    orders: AnyPgTable & { id: unknown };
    users: AnyPgTable & { id: unknown };
  },
): Promise<{ status: "settled" | "none" | "expired"; coins: number }> {
  const { userId, orderId, walletLedger, orders, users } = args;
  const now = args.now ?? Date.now();

  await lockUser(tx, users, userId);
  await tx.execute(sql`SELECT id FROM ${orders} WHERE id = ${orderId} FOR UPDATE`);

  const [row] = await tx
    .select({ id: walletLedger.id, coins: walletLedger.coins, reservedUntil: walletLedger.reservedUntil })
    .from(walletLedger)
    .where(and(
      eq(walletLedger.userId, userId),
      eq(walletLedger.sourceType, "redemption"),
      eq(walletLedger.sourceId, orderId.toString()),
    ))
    .limit(1);
  // `== null` on purpose: a fake/partial row that omits the column is a
  // committed debit, not a hold.
  if (!row || row.reservedUntil == null) return { status: "none", coins: 0 };
  if (row.reservedUntil <= now) return { status: "expired", coins: row.coins };

  await tx.update(walletLedger).set({ reservedUntil: null }).where(eq(walletLedger.id, row.id));
  return { status: "settled", coins: row.coins };
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
    .select({ id: walletLedger.id, coins: walletLedger.coins, reservedUntil: walletLedger.reservedUntil })
    .from(walletLedger)
    .where(and(
      eq(walletLedger.userId, userId),
      eq(walletLedger.sourceType, "redemption"),
      eq(walletLedger.sourceId, orderId.toString()),
    ))
    .limit(1);
  if (!debit) return { coinsReturned: 0 };

  // A hold, not a spend: nothing was ever committed, so there is nothing to
  // credit back. Expire it now instead of waiting out its TTL and return the
  // coins it was holding, so callers that mirror the coin reversal in their
  // own money ledger (puchkaman's `reverseOrderRedemption`) behave the same
  // for a released hold as for a reversed debit. Already expired => already
  // released: return 0 rather than letting a second call mirror it twice.
  if (debit.reservedUntil != null) {
    const now = Date.now();
    if (debit.reservedUntil <= now) return { coinsReturned: 0 };
    await tx.update(walletLedger).set({ reservedUntil: now }).where(eq(walletLedger.id, debit.id));
    return { coinsReturned: debit.coins };
  }

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

/**
 * Reverses an award previously written by `award()`: debits back the coins
 * credited for a given (eventType, source), e.g. when the order that earned
 * them is later refunded.
 *
 * Mirrors `reverseRedemption`'s idempotency approach exactly: locks the
 * user, looks up the original credit row, checks for an existing reversal
 * scoped to the same source, and no-ops (`{coinsReturned: 0}`, no write, no
 * throw) when the award was never made or was already reversed. Unlike
 * `reverseRedemption`, this takes no order-row lock — `award()`'s source is
 * opaque (it need not be an order at all), so the per-user lock is the only
 * one this shared primitive can assume every caller can take.
 */
export async function reverseAward(
  tx: Tx,
  args: {
    userId: bigint;
    eventType: string;
    source: { type: string; id: string };
    walletLedger: WalletTables<string>["walletLedger"];
    users: AnyPgTable & { id: unknown };
  },
): Promise<{ coinsReturned: number }> {
  const { userId, eventType, source, walletLedger, users } = args;

  await lockUser(tx, users, userId);

  const [credit] = await tx
    .select({ coins: walletLedger.coins })
    .from(walletLedger)
    .where(and(
      eq(walletLedger.userId, userId),
      eq(walletLedger.sourceType, source.type),
      eq(walletLedger.sourceId, source.id),
      eq(walletLedger.eventType, eventType),
    ))
    .limit(1);
  if (!credit) return { coinsReturned: 0 };

  // Same "no DB constraint enforces this, the lock + query is the only
  // guard" situation as reverseRedemption's reversal dedupe.
  const reversalSourceType = `${source.type}_reversal`;
  const [existingReversal] = await tx
    .select({ id: walletLedger.id })
    .from(walletLedger)
    .where(and(
      eq(walletLedger.userId, userId),
      eq(walletLedger.sourceType, reversalSourceType),
      eq(walletLedger.sourceId, source.id),
      eq(walletLedger.eventType, eventType),
    ))
    .limit(1);
  if (existingReversal) return { coinsReturned: 0 };

  await tx.insert(walletLedger).values({
    userId,
    direction: "debit",
    sourceType: reversalSourceType,
    sourceId: source.id,
    eventType,
    coins: credit.coins,
    memo: `reverses award (${eventType}) for ${source.type} ${source.id}`,
  });

  return { coinsReturned: credit.coins };
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
        .where(and(eq(walletLedger.userId, userId), unexpired(walletLedger, Date.now())));
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
      // Lapsed holds are hidden, not shown as spends: the coins came back, so
      // a "spent 40 coins" row the balance disagrees with is just a lie.
      const scope = and(eq(walletLedger.userId, userId), unexpired(walletLedger, Date.now()));
      const where = facet ? and(scope, facet) : scope;
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
        .where(and(eq(walletLedger.userId, userId), unexpired(walletLedger, Date.now())))
        .orderBy(desc(walletLedger.createdAt))
        .limit(limit);
      // eventType cast: same drizzle/TS limitation as ledgerPage above.
      return rows.map((r) => ({ ...r, eventType: r.eventType as E | null }));
    },

    async earnSpendTotals(userId: bigint): Promise<{ earned: number; spent: number }> {
      const coinsIf = (dir: "credit" | "debit") =>
        sql<number>`cast(coalesce(sum(case when ${walletLedger.direction} = ${dir} then ${walletLedger.coins} else 0 end), 0) as int)`;
      const [agg] = await db.select({ earned: coinsIf("credit"), spent: coinsIf("debit") })
        .from(walletLedger).where(and(eq(walletLedger.userId, userId), unexpired(walletLedger, Date.now())));
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
