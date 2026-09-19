import { BaseRepository } from "@foundry/database";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { ledgerEntries, users } from "@/db/schema";
import { SessionBaseService } from "./session-service";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type LedgerDirection = (typeof ledgerEntries.direction.enumValues)[number];
type LedgerEntryType = (typeof ledgerEntries.type.enumValues)[number];

export type LedgerRecordInput = {
  userId: bigint;
  bookingId?: bigint | null;
  paymentId?: bigint | null;
  direction: LedgerDirection;
  type: LedgerEntryType;
  amount: string;
  currency: string;
  memo?: string | null;
  providerEventId?: string | null;
};

export type LedgerListRow = {
  publicId: string;
  createdAt: number;
  direction: LedgerDirection;
  type: LedgerEntryType;
  amount: string;
  currency: string;
  memo: string | null;
  customerName: string | null;
  customerEmail: string | null;
};

class LedgerService extends SessionBaseService<typeof ledgerEntries> {
  protected sensitive = true;

  async record(tx: Tx, input: LedgerRecordInput): Promise<void> {
    if (input.providerEventId) {
      const [existing] = await tx
        .select({ id: ledgerEntries.id })
        .from(ledgerEntries)
        .where(eq(ledgerEntries.providerEventId, input.providerEventId))
        .limit(1);
      if (existing) return;
    }
    await tx.insert(ledgerEntries).values({
      userId: input.userId,
      bookingId: input.bookingId ?? null,
      paymentId: input.paymentId ?? null,
      direction: input.direction,
      type: input.type,
      amount: input.amount,
      currency: input.currency,
      memo: input.memo ?? null,
      providerEventId: input.providerEventId ?? null,
    });
  }

  async delete(): Promise<number> {
    throw new Error("ledger_entries is append-only");
  }

  async listRecent(limit = 50): Promise<LedgerListRow[]> {
    const rows = await db
      .select({
        publicId: ledgerEntries.publicId,
        createdAt: ledgerEntries.createdAt,
        direction: ledgerEntries.direction,
        type: ledgerEntries.type,
        amount: ledgerEntries.amount,
        currency: ledgerEntries.currency,
        memo: ledgerEntries.memo,
        customerName: users.name,
        customerEmail: users.email,
      })
      .from(ledgerEntries)
      .innerJoin(users, eq(users.id, ledgerEntries.userId))
      .orderBy(desc(ledgerEntries.createdAt))
      .limit(limit);
    return rows;
  }
}

export const ledgerService = new LedgerService(
  new BaseRepository(db, ledgerEntries, ledgerEntries.publicId, ledgerEntries.id),
);
