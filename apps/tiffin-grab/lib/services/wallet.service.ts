import { and, desc, eq, inArray, notExists, sql } from "drizzle-orm";
import { ValidationError } from "@realm/commons";
import type { Condition } from "@realm/commons/model/condition";
import type { Page, PageRequest } from "@realm/commons/util/pagination";
import { conditionToSql, columnResolver } from "@realm/database";
import { db } from "@/db/client";
import { coinRate, durationPackages, eventPayout, ledgerEntries, mealPayout, mealSizes, orders, walletLedger } from "@/db/schema";
import { getMaxWalletBalance } from "./app-settings.service";

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

  // True if crediting `coins` to userId wouldn't push their balance past the
  // admin-configured wallet cap (Coin Rate page; NULL = unlimited). Hard block,
  // not a partial top-up — a blocked award credits nothing.
  async capRoom(userId: bigint, coins: number): Promise<boolean> {
    const cap = await getMaxWalletBalance();
    if (cap === null) return true;
    const balance = await this.balance(userId);
    return balance + coins <= cap;
  }

  // Batch version of capRoom for the bulk award paths (Meal Payouts, Customer
  // Payouts) — one query for every candidate's balance instead of N+1.
  async filterUnderCap(userIds: bigint[], coins: number): Promise<{ ok: bigint[]; capped: bigint[] }> {
    if (userIds.length === 0) return { ok: [], capped: [] };
    const cap = await getMaxWalletBalance();
    if (cap === null) return { ok: userIds, capped: [] };

    const balances = await db
      .select({
        userId: walletLedger.userId,
        balance: sql<number>`coalesce(sum(case when ${walletLedger.direction} = 'credit' then ${walletLedger.coins} else -${walletLedger.coins} end), 0)::int`,
      })
      .from(walletLedger)
      .where(inArray(walletLedger.userId, userIds))
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
    if (!(await this.capRoom(userId, cfg.coins))) return false;
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
  async awardMealPayoutRule(ruleId: bigint): Promise<{ matched: number; awarded: number; coinsPerCustomer: number; capped: number }> {
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
    const { ok, capped } = await this.filterUnderCap(toAward.map((o) => o.userId), rule.coins);
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
