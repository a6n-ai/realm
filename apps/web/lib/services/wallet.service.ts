import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { eventPayout, walletLedger } from "@/db/schema";

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
}

export const walletService = new WalletService();
