import { desc, eq, sql } from "drizzle-orm";
import type { Condition } from "@foundry/commons/model/condition";
import type { Page, PageRequest } from "@foundry/commons/util/pagination";
import { BaseRepository, columnResolver, conditionToSql, pageOrder } from "@foundry/database";
import type { SortState } from "@/lib/list/sort";
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

export type LedgerSortColumn = "time" | "amount";
export type LedgerPageRow = LedgerListRow & { customerPublicId: string };
export type LedgerTotals = { credit: string; debit: string; net: string };

const ledgerColumns = columnResolver({
  type: ledgerEntries.type,
  direction: ledgerEntries.direction,
  createdAt: ledgerEntries.createdAt,
  name: users.name,
  email: users.email,
});

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

  async listRecent(limit = 50, type?: LedgerEntryType): Promise<LedgerListRow[]> {
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
      .where(type ? eq(ledgerEntries.type, type) : undefined)
      .orderBy(desc(ledgerEntries.createdAt))
      .limit(limit);
    return rows;
  }

  async listPage(
    condition: Condition | undefined,
    page: PageRequest,
    sort: SortState<LedgerSortColumn> = { column: "time", dir: "desc" },
  ): Promise<Page<LedgerPageRow>> {
    const where = conditionToSql(condition, ledgerColumns);
    const SORT_COL = { time: ledgerEntries.createdAt, amount: ledgerEntries.amount } as const;
    const [items, [{ count }]] = await Promise.all([
      db
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
          customerPublicId: users.publicId,
        })
        .from(ledgerEntries)
        .innerJoin(users, eq(users.id, ledgerEntries.userId))
        .where(where)
        .orderBy(...pageOrder(sort.dir, SORT_COL[sort.column] ?? ledgerEntries.createdAt, ledgerEntries.id))
        .limit(page.size)
        .offset(page.page * page.size),
      db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(ledgerEntries)
        .innerJoin(users, eq(users.id, ledgerEntries.userId))
        .where(where),
    ]);
    return { items, page: page.page, size: page.size, total: count };
  }

  /** In, out and net for the same filter the list uses. */
  async totals(condition: Condition | undefined): Promise<LedgerTotals> {
    const credit = sql`coalesce(sum(${ledgerEntries.amount}) filter (where ${ledgerEntries.direction} = 'credit'), 0)`;
    const debit = sql`coalesce(sum(${ledgerEntries.amount}) filter (where ${ledgerEntries.direction} = 'debit'), 0)`;
    const [row] = await db
      .select({
        credit: sql<string>`(${credit})::numeric(10,2)::text`,
        debit: sql<string>`(${debit})::numeric(10,2)::text`,
        net: sql<string>`(${credit} - ${debit})::numeric(10,2)::text`,
      })
      .from(ledgerEntries)
      .innerJoin(users, eq(users.id, ledgerEntries.userId))
      .where(conditionToSql(condition, ledgerColumns));
    return row!;
  }
}

export const ledgerService = new LedgerService(
  new BaseRepository(db, ledgerEntries, ledgerEntries.publicId, ledgerEntries.id),
);
