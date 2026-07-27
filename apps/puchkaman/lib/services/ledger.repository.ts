import { BaseRepository } from "@realm/database";
import { asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { ledgerEntries, orders } from "@/db/schema";
import type { SortState } from "@/lib/list/sort";

export type LedgerEntryRow = typeof ledgerEntries.$inferSelect;

export type LedgerSortColumn =
  | "created"
  | "type"
  | "direction"
  | "amount"
  | "customer";

export type LedgerListRow = {
  publicId: string;
  direction: LedgerEntryRow["direction"];
  type: LedgerEntryRow["type"];
  amount: string;
  memo: string | null;
  createdAt: number;
  orderPublicId: string | null;
  customerName: string | null;
  customerEmail: string | null;
};

const LEDGER_SORT_COL = {
  created: ledgerEntries.createdAt,
  type: ledgerEntries.type,
  direction: ledgerEntries.direction,
  amount: ledgerEntries.amount,
  customer: orders.customerName,
} as const;

/**
 * Ledger DAO — admin Finance Ledger list (joined to orders when present).
 */
export class LedgerRepository extends BaseRepository<typeof ledgerEntries> {
  /** Unfiltered recent page (kept for simple callers). */
  async listRecent(limit = 50, offset = 0): Promise<{ rows: LedgerListRow[]; total: number }> {
    return this.queryPage(undefined, { column: "created", dir: "desc" }, {
      page: Math.floor(offset / Math.max(limit, 1)),
      size: limit,
    }).then((p) => ({ rows: p.items, total: p.total }));
  }

  /** Admin list with SQL `where`, sort, and offset pagination. */
  async queryPage(
    where: SQL | undefined,
    sort: SortState<LedgerSortColumn>,
    page: { page: number; size: number },
  ): Promise<{ items: LedgerListRow[]; page: number; size: number; total: number }> {
    const col = LEDGER_SORT_COL[sort.column] ?? ledgerEntries.createdAt;
    const orderBy = sort.dir === "asc" ? asc(col) : desc(col);

    const [rows, [{ count }]] = await Promise.all([
      this.db
        .select({
          publicId: ledgerEntries.publicId,
          direction: ledgerEntries.direction,
          type: ledgerEntries.type,
          amount: ledgerEntries.amount,
          memo: ledgerEntries.memo,
          createdAt: ledgerEntries.createdAt,
          orderPublicId: orders.publicId,
          customerName: orders.customerName,
          customerEmail: orders.customerEmail,
        })
        .from(ledgerEntries)
        .leftJoin(orders, eq(ledgerEntries.orderId, orders.id))
        .where(where)
        .orderBy(orderBy)
        .limit(page.size)
        .offset(page.page * page.size),
      this.db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(ledgerEntries)
        .leftJoin(orders, eq(ledgerEntries.orderId, orders.id))
        .where(where),
    ]);

    return {
      items: rows.map((r) => ({
        ...r,
        orderPublicId: r.orderPublicId ?? null,
        customerName: r.customerName ?? null,
        customerEmail: r.customerEmail ?? null,
      })),
      page: page.page,
      size: page.size,
      total: count,
    };
  }
}

export const ledgerRepository = new LedgerRepository(
  db,
  ledgerEntries,
  ledgerEntries.publicId,
  ledgerEntries.id,
);
