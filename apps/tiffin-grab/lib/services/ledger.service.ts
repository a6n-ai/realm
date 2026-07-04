import { BaseRepository } from "@realm/commons-drizzle";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { ledgerEntries } from "@/db/schema";
import { SessionBaseService } from "./session-service";

// A transaction handle (or the base db) — the money ledger is written inside the
// same tx as the order/payment/redemption it records.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
    });
  }

  // Total spent = SUM(payment credits) − SUM(refund debits). `discount` rows are
  // excluded (they record the give-up, not customer spend).
  async totalSpent(userId: bigint): Promise<string> {
    const [row] = await db
      .select({
        paid: sql<string>`coalesce(sum(case when ${ledgerEntries.type} = 'payment' then ${ledgerEntries.amount} else 0 end), 0)`,
        refunded: sql<string>`coalesce(sum(case when ${ledgerEntries.type} = 'refund' then ${ledgerEntries.amount} else 0 end), 0)`,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, userId));
    const net = Number(row?.paid ?? 0) - Number(row?.refunded ?? 0);
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
