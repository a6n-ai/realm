import { desc, eq, sql } from "drizzle-orm";
import { ValidationError } from "@tiffin/commons";
import { db } from "@/db/client";
import { coinRate, eventPayout, ledgerEntries, walletLedger } from "@/db/schema";

export type BusinessEvent = (typeof walletLedger.eventType.enumValues)[number];

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
    if (coins <= 0) throw new ValidationError("coins must be positive");
    if (coins > (await this.balance(userId))) throw new ValidationError("insufficient coins");
    const rate = await this.activeRate(order.currency);
    let currencyValue = Math.min(coins * rate, order.total);
    const coinsSpent = Math.round(currencyValue / rate);
    currencyValue = Number((coinsSpent * rate).toFixed(2));
    return db.transaction(async (tx) => {
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
