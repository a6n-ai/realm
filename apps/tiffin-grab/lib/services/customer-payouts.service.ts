// Backs the Wallet → Give coins panel: a filter-driven, one-off bulk coin
// broadcast. A manual, admin-picks-people-right-now action with no
// persistence and no re-run guard (running the same filters and hitting Save again is meant to
// pay again).
import { zonedDateIso } from "@foundry/commons";
import { unexpired } from "@foundry/wallet";
import { and, desc, eq, exists, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { ledgerEntries, orders, users, walletLedger } from "@/db/schema";
import { getAppSettings } from "./app-settings.service";
import { lastTiffinSql, laterOrderSql } from "./orders.service";
import { walletService } from "./wallet.service";

export const MAX_REVIEW_ROWS = 2000;

export type RevenueOp = ">" | "<" | "=";

export type PayoutCandidateFilters = {
  accountPublicId?: string | null;
  revenueOp?: RevenueOp | null;
  revenueValue?: number | null;
  startDateFrom?: string | null; // ISO date
  startDateTo?: string | null; // ISO date
  city?: string | null;
  lastTiffinFrom?: string | null; // ISO date, latest plan's last tiffin
  lastTiffinTo?: string | null;
  lapsed?: boolean | null; // latest plan ended before today and was not renewed
  lapsedFrom?: string | null;
  lapsedTo?: string | null;
};

export type PayoutCandidate = {
  publicId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  revenue: string;
  firstOrderDate: string;
  lastTiffin: string | null;
  /** Spendable wallet balance (credits − debits, lapsed holds excluded). */
  walletCoins: number;
};

const REVENUE_SQL = sql<string>`coalesce(sum(case when ${ledgerEntries.type} = 'payment' then ${ledgerEntries.amount} else 0 end), 0) - coalesce(sum(case when ${ledgerEntries.type} = 'refund' then ${ledgerEntries.amount} else 0 end), 0)`;

export async function listOrderCities(): Promise<string[]> {
  const rows = await db.selectDistinct({ city: orders.city }).from(orders).orderBy(orders.city);
  return rows.map((r) => r.city);
}

// One query: users with >=1 order (customers with none have nothing to
// filter/pay against), their first order's start date, and their net
// revenue (same "payment credits − refund debits" formula as
// ledger.service.ts::totalSpent, generalized across all customers at once
// instead of one query per customer).
export async function listPayoutCandidates(
  filters: PayoutCandidateFilters,
  { limit = MAX_REVIEW_ROWS }: { limit?: number } = {},
): Promise<{ rows: PayoutCandidate[]; total: number }> {
  const orderAgg = db
    .select({
      userId: orders.userId,
      firstOrderDate: sql<string>`min(${orders.startDate})`.as("first_order_date"),
    })
    .from(orders)
    .groupBy(orders.userId)
    .as("oa");

  const revenueAgg = db
    .select({
      userId: ledgerEntries.userId,
      revenue: REVENUE_SQL.as("revenue"),
    })
    .from(ledgerEntries)
    .groupBy(ledgerEntries.userId)
    .as("ra");

  // Same spendable-balance formula as orders.service / walletService.balance —
  // lapsed checkout holds must not inflate "already has coins" on this review table.
  const walletAgg = db
    .select({
      userId: walletLedger.userId,
      coins: sql<number>`cast(coalesce(sum(case when ${walletLedger.direction} = 'credit' then ${walletLedger.coins} else -${walletLedger.coins} end), 0) as int)`.as("wallet_coins"),
    })
    .from(walletLedger)
    .where(unexpired(walletLedger, Date.now()))
    .groupBy(walletLedger.userId)
    .as("wa");

  // Each customer's latest plan; lastTiffinSql/laterOrderSql bind to the outer `orders`.
  const latestPlan = db
    .selectDistinctOn([orders.userId], {
      userId: orders.userId,
      lastTiffin: sql<string | null>`${lastTiffinSql}`.as("last_tiffin"),
      renewed: sql<boolean>`${laterOrderSql}`.as("renewed"),
    })
    .from(orders)
    .where(inArray(orders.status, ["active", "paused", "completed"]))
    .orderBy(orders.userId, desc(orders.startDate))
    .as("lp");

  const conditions = [eq(users.role, "user")];
  if (filters.lastTiffinFrom) conditions.push(gte(latestPlan.lastTiffin, filters.lastTiffinFrom));
  if (filters.lastTiffinTo) conditions.push(lte(latestPlan.lastTiffin, filters.lastTiffinTo));
  if (filters.lapsed || filters.lapsedFrom || filters.lapsedTo) {
    const today = zonedDateIso(Date.now(), (await getAppSettings()).timezone);
    conditions.push(sql`${latestPlan.lastTiffin} < ${today}`, sql`not ${latestPlan.renewed}`);
    if (filters.lapsedFrom) conditions.push(gte(latestPlan.lastTiffin, filters.lapsedFrom));
    if (filters.lapsedTo) conditions.push(lte(latestPlan.lastTiffin, filters.lapsedTo));
  }
  if (filters.accountPublicId) conditions.push(eq(users.publicId, filters.accountPublicId));
  if (filters.startDateFrom) conditions.push(gte(orderAgg.firstOrderDate, filters.startDateFrom));
  if (filters.startDateTo) conditions.push(lte(orderAgg.firstOrderDate, filters.startDateTo));
  if (filters.city) {
    conditions.push(
      exists(
        db.select({ one: sql`1` }).from(orders)
          .where(and(eq(orders.userId, users.id), eq(orders.city, filters.city))),
      ),
    );
  }
  if (filters.revenueOp && filters.revenueValue != null) {
    const revenueExpr = sql`coalesce(${revenueAgg.revenue}, 0)`;
    const value = filters.revenueValue;
    const cmp =
      filters.revenueOp === ">" ? sql`${revenueExpr} > ${value}`
      : filters.revenueOp === "<" ? sql`${revenueExpr} < ${value}`
      : sql`${revenueExpr} = ${value}`;
    conditions.push(cmp);
  }

  const rows = await db
    .select({
      publicId: users.publicId,
      name: users.name,
      phone: users.phone,
      email: users.email,
      revenue: sql<string>`coalesce(${revenueAgg.revenue}, 0)`,
      firstOrderDate: orderAgg.firstOrderDate,
      lastTiffin: latestPlan.lastTiffin,
      walletCoins: sql<number>`coalesce(${walletAgg.coins}, 0)`.mapWith(Number),
      total: sql<number>`count(*) over()`.mapWith(Number),
    })
    .from(users)
    .innerJoin(orderAgg, eq(orderAgg.userId, users.id))
    .leftJoin(revenueAgg, eq(revenueAgg.userId, users.id))
    .leftJoin(latestPlan, eq(latestPlan.userId, users.id))
    .leftJoin(walletAgg, eq(walletAgg.userId, users.id))
    .where(and(...conditions))
    .orderBy(users.name)
    .limit(limit);

  return { rows: rows.map(({ total: _t, ...r }) => r), total: rows[0]?.total ?? 0 };
}

export async function awardCustomerBroadcast(
  userIds: bigint[],
  coins: number,
  memo: string | undefined,
  actorId: bigint | null,
): Promise<{ awarded: number; coinsPerCustomer: number; capped: number }> {
  if (coins <= 0 || userIds.length === 0) return { awarded: 0, coinsPerCustomer: coins, capped: 0 };

  const { ok, capped } = await walletService.filterUnderCap(userIds, coins);
  if (ok.length === 0) return { awarded: 0, coinsPerCustomer: coins, capped: capped.length };

  await db.insert(walletLedger).values(
    ok.map((userId) => ({
      userId,
      direction: "credit" as const,
      sourceType: "manual_broadcast",
      // Unique per row for audit traceability. No exclusion/idempotency
      // check here: this is a one-off broadcast, re-running the same filters is meant to pay
      // again, not be blocked.
      sourceId: `broadcast:${crypto.randomUUID()}:${userId}`,
      coins,
      memo: memo?.trim() || "Manual customer payout",
      createdBy: actorId,
    })),
  );

  return { awarded: ok.length, coinsPerCustomer: coins, capped: capped.length };
}
