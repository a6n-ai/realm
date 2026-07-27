import type { Condition, FilterCondition } from "@realm/commons/model/condition";
import type { Page, PageRequest } from "@realm/commons/util/pagination";
import { BaseService, columnResolver, conditionToSql } from "@realm/database";
import { db } from "@/db/client";
import { ledgerEntries, orders } from "@/db/schema";
import type { SortState } from "@/lib/list/sort";
import {
  ledgerRepository,
  type LedgerListRow,
  type LedgerRepository,
  type LedgerSortColumn,
} from "./ledger.repository";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type LedgerDirection = (typeof ledgerEntries.direction.enumValues)[number];
type LedgerEntryType = (typeof ledgerEntries.type.enumValues)[number];

export interface LedgerRecordInput {
  /** Null for guest checkouts (tiffin requires user; puchkaman allows guest). */
  userId?: bigint | null;
  orderId?: bigint | null;
  paymentId?: bigint | null;
  direction: LedgerDirection;
  type: LedgerEntryType;
  amount: number | string;
  memo?: string | null;
}

function resolveLedgerFacet(f: FilterCondition) {
  return columnResolver({
    direction: ledgerEntries.direction,
    type: ledgerEntries.type,
    createdAt: ledgerEntries.createdAt,
    publicId: ledgerEntries.publicId,
    memo: ledgerEntries.memo,
    orderPublicId: orders.publicId,
    customerName: orders.customerName,
    customerEmail: orders.customerEmail,
  })(f);
}

/**
 * Append-only money ledger — same pattern as tiffin-grab.
 * Corrections are new `adjustment` rows; never update/delete.
 */
class LedgerService extends BaseService<typeof ledgerEntries> {
  constructor(private readonly ledgerRepo: LedgerRepository) {
    super(ledgerRepo);
  }

  async record(tx: Tx, input: LedgerRecordInput): Promise<void> {
    const amount = typeof input.amount === "string" ? input.amount : input.amount.toFixed(2);
    await tx.insert(ledgerEntries).values({
      userId: input.userId ?? null,
      orderId: input.orderId ?? null,
      paymentId: input.paymentId ?? null,
      direction: input.direction,
      type: input.type,
      amount,
      memo: input.memo ?? null,
    });
  }

  async listAdmin(page = 0, size = 50): Promise<{ rows: LedgerListRow[]; total: number }> {
    return this.ledgerRepo.listRecent(size, page * size);
  }

  /** Admin list — Condition facets + URL sort + offset pagination. */
  async queryLedger(
    condition: Condition | undefined,
    page: PageRequest,
    sort: SortState<LedgerSortColumn> = { column: "created", dir: "desc" },
  ): Promise<Page<LedgerListRow>> {
    const where = conditionToSql(condition, resolveLedgerFacet);
    return this.ledgerRepo.queryPage(where, sort, page);
  }

  async delete(): Promise<number> {
    throw new Error("ledger_entries is append-only");
  }
}

export const ledgerService = new LedgerService(ledgerRepository);

export type { LedgerListRow, LedgerSortColumn };
