import { pageOffset } from "@/lib/list/pagination";
import { and, desc, eq, gt, gte, ilike, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { earnedCoinsSql, spentCoinsSql, unexpired } from "@foundry/wallet";
import { pageOrder } from "@foundry/database";
import { coinRate, users, walletLedger } from "@/db/schema";

type Range = { from: number; to: number };

export type BalanceSortColumn = "customer" | "balance" | "value" | "earned" | "redeemed" | "last";
export type BalanceFilter = "has" | "zero";

const inRange = (r: Range) => and(gte(walletLedger.createdAt, r.from), lte(walletLedger.createdAt, r.to));

// Same rule as walletService.balance(): lapsed holds are not part of what a customer holds.
export const balanceSql = (asOf: number = Date.now()) =>
  sql<number>`cast(coalesce(sum(case when ${walletLedger.createdAt} <= ${asOf} and ${unexpired(walletLedger, asOf)} then (case when ${walletLedger.direction} = 'credit' then ${walletLedger.coins} else -${walletLedger.coins} end) else 0 end), 0) as int)`;

/** Customers only: staff and soft-deleted accounts never appear on a balance sheet. */
const customerOnly = and(eq(users.role, "user"), ne(users.status, "deleted"));

export async function currentRate(): Promise<number | null> {
  const [row] = await db.select({ v: coinRate.valuePerCoin }).from(coinRate).orderBy(desc(coinRate.createdAt)).limit(1);
  return row ? Number(row.v) : null;
}

const money = (coins: number, rate: number | null) => (rate == null ? null : Number((coins * rate).toFixed(2)));

/**
 * Balances are held as of the END of the picked range, but never later than
 * now: a live hold has not lapsed yet, so projecting a future range end would
 * wrongly release it.
 */
export const asOfEnd = (range: Range) => Math.min(range.to, Date.now());

function perUserBalances(asOf: number) {
  return db
    .select({
      userId: walletLedger.userId,
      balance: balanceSql(asOf).as("balance"),
      last: sql<number>`max(${walletLedger.createdAt})`.as("last"),
    })
    .from(walletLedger)
    .where(lte(walletLedger.createdAt, asOf))
    .groupBy(walletLedger.userId)
    .as("bal");
}

/** Cards: balance figures are as of the range end; earned and redeemed are within the range. */
export async function walletBalanceStats(range: Range) {
  const bal = perUserBalances(asOfEnd(range));
  const [[held], [flow], rate] = await Promise.all([
    db
      .select({
        outstanding: sql<number>`cast(coalesce(sum(${bal.balance}), 0) as int)`,
        wallets: sql<number>`cast(count(*) filter (where ${bal.balance} > 0) as int)`,
      })
      .from(bal)
      .innerJoin(users, eq(users.id, bal.userId))
      .where(customerOnly),
    db
      .select({ earned: earnedCoinsSql(walletLedger), redeemed: spentCoinsSql(walletLedger) })
      .from(walletLedger)
      .innerJoin(users, eq(users.id, walletLedger.userId))
      .where(and(customerOnly, unexpired(walletLedger, Date.now()), inRange(range))),
    currentRate(),
  ]);
  return {
    outstanding: held.outstanding,
    value: money(held.outstanding, rate),
    walletsWithBalance: held.wallets,
    earned: flow.earned,
    redeemed: flow.redeemed,
  };
}

export async function listWalletBalances({ q, filter, sort, page, range }: {
  q?: string;
  filter?: BalanceFilter;
  sort: { column: BalanceSortColumn; dir: "asc" | "desc" };
  page: { page: number; size: number };
  range: Range;
}) {
  const bal = perUserBalances(asOfEnd(range));
  const flow = db
    .select({
      userId: walletLedger.userId,
      earned: earnedCoinsSql(walletLedger).as("earned"),
      redeemed: spentCoinsSql(walletLedger).as("redeemed"),
    })
    .from(walletLedger)
    .where(and(unexpired(walletLedger, Date.now()), inRange(range)))
    .groupBy(walletLedger.userId)
    .as("flow");

  const earned = sql<number>`coalesce(${flow.earned}, 0)`;
  const redeemed = sql<number>`coalesce(${flow.redeemed}, 0)`;
  const search: SQL | undefined = q
    ? or(ilike(users.name, `%${q}%`), ilike(users.email, `%${q}%`), ilike(users.phone, `%${q}%`))
    : undefined;
  const where = and(
    customerOnly,
    search,
    filter === "has" ? gt(bal.balance, 0) : undefined,
    filter === "zero" ? sql`${bal.balance} <= 0` : undefined,
  );
  const col = {
    customer: sql`lower(coalesce(${users.name}, ${users.email}))`,
    balance: bal.balance,
    value: bal.balance, // value is balance x one rate, so it orders the same way
    earned,
    redeemed,
    last: bal.last,
  }[sort.column];

  const from = (b: typeof db) =>
    b.select({ n: sql<number>`cast(count(*) as int)` }).from(bal).innerJoin(users, eq(users.id, bal.userId)).leftJoin(flow, eq(flow.userId, bal.userId)).where(where);

  const [rows, [{ n }], rate] = await Promise.all([
    db
      .select({
        userId: users.id,
        publicId: users.publicId,
        name: users.name,
        email: users.email,
        phone: users.phone,
        balance: bal.balance,
        earned,
        redeemed,
        last: bal.last,
      })
      .from(bal)
      .innerJoin(users, eq(users.id, bal.userId))
      .leftJoin(flow, eq(flow.userId, bal.userId))
      .where(where)
      .orderBy(...pageOrder(sort.dir, col, users.id))
      .limit(page.size)
      .offset(pageOffset(page.page, page.size)),
    from(db),
    currentRate(),
  ]);
  return { rows: rows.map((r) => ({ ...r, value: money(r.balance, rate) })), total: n };
}

/** One customer's wallet cards: balance as of now, lifetime earned and redeemed, last activity. */
export async function customerWalletStats(userId: bigint) {
  const now = Date.now();
  const [[agg], rate] = await Promise.all([
    db
      .select({
        balance: balanceSql(now),
        earned: earnedCoinsSql(walletLedger),
        redeemed: spentCoinsSql(walletLedger),
        last: sql<number | null>`max(${walletLedger.createdAt})`,
      })
      .from(walletLedger)
      .where(and(eq(walletLedger.userId, userId), unexpired(walletLedger, now))),
    currentRate(),
  ]);
  return { ...agg, rate, value: money(agg.balance, rate) };
}
