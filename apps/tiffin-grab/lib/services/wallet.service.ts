import { and, desc, eq, sql } from "drizzle-orm";
import { ValidationError } from "@realm/commons";
import type { Condition } from "@realm/commons/model/condition";
import type { Page, PageRequest } from "@realm/commons/util/pagination";
import { conditionToSql, columnResolver } from "@realm/database";
import { db } from "@/db/client";
import { coinRate, eventPayout, ledgerEntries, orders, walletLedger } from "@/db/schema";

export type BusinessEvent = (typeof walletLedger.eventType.enumValues)[number];

export type WalletTx = {
  publicId: string;
  direction: "credit" | "debit";
  coins: number;
  eventType: BusinessEvent | null;
  sourceType: string;
  sourceId: string;
  memo: string | null;
  createdAt: number;
  orderPublicId: string | null;
};

class WalletService {
  async balance(userId: bigint): Promise<number> {
    const [row] = await db
      .select({
        bal: sql<number>`coalesce(sum(case when ${walletLedger.direction} = 'credit' then ${walletLedger.coins} else -${walletLedger.coins} end), 0)::int`,
      })
      .from(walletLedger)
      .where(eq(walletLedger.userId, userId));
    return row?.bal ?? 0;
  }

  async ledgerPage(userId: bigint, condition: Condition | undefined, page: PageRequest): Promise<Page<WalletTx>> {
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
    return { items: rows.map((r) => ({ ...r, orderPublicId: r.orderPublicId ?? null })), page: page.page, size: page.size, total: count };
  }

  async award(
    userId: bigint,
    eventType: BusinessEvent,
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
  }

  async recentTransactions(userId: bigint, limit = 10): Promise<WalletTx[]> {
    return db
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
  }

  async earnSpendTotals(userId: bigint): Promise<{ earned: number; spent: number }> {
    const coinsIf = (dir: "credit" | "debit") =>
      sql<number>`cast(coalesce(sum(case when ${walletLedger.direction} = ${dir} then ${walletLedger.coins} else 0 end), 0) as int)`;
    const [agg] = await db.select({ earned: coinsIf("credit"), spent: coinsIf("debit") })
      .from(walletLedger).where(eq(walletLedger.userId, userId));
    return { earned: agg.earned, spent: agg.spent };
  }

  // Display-only money value. activeRate throws when a currency has no coin_rate
  // row; degrade to null so the wallet renders coins-only instead of 500ing.
  async moneyValue(coins: number, currency: string): Promise<number | null> {
    try {
      const rate = await this.activeRate(currency);
      return Number((coins * rate).toFixed(2));
    } catch {
      return null;
    }
  }

  async activeRate(currency: string): Promise<number> {
    const [row] = await db
      .select({ v: coinRate.valuePerCoin })
      .from(coinRate)
      .where(eq(coinRate.currency, currency))
      .orderBy(desc(coinRate.createdAt))
      .limit(1);
    if (!row) throw new ValidationError(`No coin rate for ${currency}`);
    return Number(row.v);
  }

  async redeem(
    userId: bigint,
    coins: number,
    order: { id: bigint; total: number; currency: string },
  ): Promise<{ coinsSpent: number; currencyValue: number }> {
    // Fast fail: cheap pre-validation before opening a txn
    if (coins <= 0) throw new ValidationError("coins must be positive");

    const rate = await this.activeRate(order.currency);

    // ponytail: per-user row lock serializes redemptions; fine at current scale, revisit if redemption throughput becomes hot.
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);

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

      const [existing] = await tx.select({ id: walletLedger.id })
        .from(walletLedger)
        .where(and(eq(walletLedger.sourceType, "redemption"), eq(walletLedger.sourceId, order.id.toString())))
        .limit(1);
      if (existing) throw new ValidationError("coins already redeemed for this order");

      let currencyValue = Math.min(coins * rate, order.total);
      const coinsSpent = Math.round(currencyValue / rate);
      // Re-apply cap after recompute: for non-round rates, coinsSpent*rate can exceed order.total
      currencyValue = Math.min(Number((coinsSpent * rate).toFixed(2)), order.total);

      await tx.insert(walletLedger).values({
        userId,
        direction: "debit",
        sourceType: "redemption",
        sourceId: order.id.toString(),
        coins: coinsSpent,
        orderId: order.id,
        memo: "checkout redemption",
      });
      await tx.insert(ledgerEntries).values({
        userId,
        orderId: order.id,
        direction: "debit",
        type: "discount",
        amount: currencyValue.toFixed(2),
        memo: "coin redemption",
      });
      return { coinsSpent, currencyValue };
    });
  }
}

export const walletService = new WalletService();
