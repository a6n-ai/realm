import { BaseRepository } from "@foundry/database";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { ledgerEntries } from "@/db/schema";
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
}

export const ledgerService = new LedgerService(
  new BaseRepository(db, ledgerEntries, ledgerEntries.publicId, ledgerEntries.id),
);
