// Backs the Wallet → Payouts "Customer Payouts" panel: a filter-driven,
// one-off bulk coin broadcast. Distinct from wallet.service.ts's
// awardMealPayoutRule — that's a standing rule with idempotency; this is a
// manual, admin-picks-people-right-now action with no persistence and no
// re-run guard (running the same filters and hitting Save again is meant to
// pay again).
import { and, eq, exists, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { ledgerEntries, orders, users, walletLedger } from "@/db/schema";
import { walletService } from "./wallet.service";

export type RevenueOp = ">" | "<" | "=";

export type PayoutCandidateFilters = {
  accountPublicId?: string | null;
  revenueOp?: RevenueOp | null;
  revenueValue?: number | null;
  startDateFrom?: string | null; // ISO date
  startDateTo?: string | null; // ISO date
  city?: string | null;
};

export type PayoutCandidate = {
  publicId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  revenue: string;
  firstOrderDate: string;
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
export async function listPayoutCandidates(filters: PayoutCandidateFilters): Promise<PayoutCandidate[]> {
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

  const conditions = [eq(users.role, "user")];
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
    })
    .from(users)
    .innerJoin(orderAgg, eq(orderAgg.userId, users.id))
    .leftJoin(revenueAgg, eq(revenueAgg.userId, users.id))
    .where(and(...conditions))
    .orderBy(users.name);

  return rows;
}

export async function awardCustomerBroadcast(
  userIds: bigint[],
  coins: number,
  memo?: string,
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
      // check here — deliberately unlike awardMealPayoutRule: this is a
      // one-off broadcast, re-running the same filters is meant to pay
      // again, not be blocked.
      sourceId: `broadcast:${crypto.randomUUID()}:${userId}`,
      coins,
      memo: memo?.trim() || "Manual customer payout",
    })),
  );

  return { awarded: ok.length, coinsPerCustomer: coins, capped: capped.length };
}
