import { BaseRepository } from "@foundry/database";
import { netSpendSql } from "@/lib/payments/net-spend-sql";
import { eq, sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import { ledgerEntries } from "@/db/schema";
import { SessionBaseService } from "../services/session-service";

// A transaction handle (or the base db) — the money ledger is written inside the

type LedgerDirection = (typeof ledgerEntries.direction.enumValues)[number];
type LedgerEntryType = (typeof ledgerEntries.type.enumValues)[number];

export interface LedgerRecordInput {
  userId: bigint;
  orderId?: bigint | null;
  paymentId?: bigint | null;
  direction: LedgerDirection;
  type: LedgerEntryType;
  amount: number | string; // dollars; stored as numeric(10,2)
  memo?: string | null;
  providerEventId?: string | null;
}

// Append-only money ledger. Corrections are new `adjustment` rows, never edits —
// so no update/delete is exposed.
class LedgerService extends SessionBaseService<typeof ledgerEntries> {
  protected sensitive = true;

  async record(tx: Tx, input: LedgerRecordInput): Promise<void> {
    const amount = typeof input.amount === "string" ? input.amount : input.amount.toFixed(2);
    await tx.insert(ledgerEntries).values({
      userId: input.userId,
      orderId: input.orderId ?? null,
      paymentId: input.paymentId ?? null,
      direction: input.direction,
      type: input.type,
      amount,
      memo: input.memo ?? null,
      providerEventId: input.providerEventId ?? null,
    });
  }

  // Total spent = SUM(payment credits) − SUM(refund debits). `discount` rows are
  // excluded (they record the give-up, not customer spend).
  async totalSpent(userId: bigint): Promise<string> {
    const [row] = await db
      .select({
        spent: netSpendSql,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, userId));
    return Number(row?.spent ?? 0).toFixed(2);
  }

  // Total savings = SUM(discount debits). Both coupon and wallet redemptions
  // land here as `discount` rows, so this single aggregate is the whole number.
  async totalSavings(userId: bigint): Promise<string> {
    const [row] = await db
      .select({
        discounted: sql<string>`coalesce(sum(case when ${ledgerEntries.type} = 'discount' then ${ledgerEntries.amount} else 0 end), 0)`,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, userId));
    const net = Number(row?.discounted ?? 0);
    return net.toFixed(2);
  }

  // Append-only: never delete a ledger row.
  async delete(): Promise<number> {
    throw new Error("ledger_entries is append-only");
  }
}

export const ledgerService = new LedgerService(
  new BaseRepository(db, ledgerEntries, ledgerEntries.publicId, ledgerEntries.id),
);
