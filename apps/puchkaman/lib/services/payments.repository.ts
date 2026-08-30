import { BaseRepository } from "@realm/database";
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, organization, payments } from "@/db/schema";
import type { SortState } from "@/lib/list/sort";
import { resolveOrgScopeMode } from "@/lib/services/org-scope";

export type PaymentRow = typeof payments.$inferSelect;

export type PaymentSortColumn =
  | "customer"
  | "status"
  | "method"
  | "amount"
  | "created"
  | "capturedAt";

export type PaymentListRow = {
  publicId: string;
  status: PaymentRow["status"];
  method: PaymentRow["method"];
  amount: string;
  cloverChargeId: string | null;
  reference: string | null;
  capturedAt: number | null;
  createdAt: number;
  orderPublicId: string;
  customerName: string;
  customerEmail: string;
  clientCode: string | null;
};

const PAYMENT_SORT_COL = {
  customer: orders.customerName,
  status: payments.status,
  method: payments.method,
  amount: payments.amount,
  created: payments.createdAt,
  capturedAt: payments.capturedAt,
} as const;

/**
 * Payments DAO — admin Finance Transactions list (joined to orders).
 */
export class PaymentsRepository extends BaseRepository<typeof payments> {
  /** Unfiltered recent page (kept for simple callers). */
  async listRecent(limit = 50, offset = 0): Promise<{ rows: PaymentListRow[]; total: number }> {
    return this.queryPage(undefined, { column: "created", dir: "desc" }, {
      page: Math.floor(offset / Math.max(limit, 1)),
      size: limit,
    }).then((p) => ({ rows: p.items, total: p.total }));
  }

  /** Admin list with SQL `where`, sort, and offset pagination. */
  async queryPage(
    where: SQL | undefined,
    sort: SortState<PaymentSortColumn>,
    page: { page: number; size: number },
  ): Promise<{ items: PaymentListRow[]; page: number; size: number; total: number }> {
    const col = PAYMENT_SORT_COL[sort.column] ?? payments.createdAt;
    const orderBy = sort.dir === "asc" ? asc(col) : desc(col);
    const scopeMode = await resolveOrgScopeMode();
    const scopedWhere =
      scopeMode.mode === "org" ? and(where, eq(payments.organizationId, scopeMode.orgId)) : where;

    const [rows, [{ count }]] = await Promise.all([
      this.db
        .select({
          publicId: payments.publicId,
          status: payments.status,
          method: payments.method,
          amount: payments.amount,
          cloverChargeId: payments.cloverChargeId,
          reference: payments.reference,
          capturedAt: payments.capturedAt,
          createdAt: payments.createdAt,
          orderPublicId: orders.publicId,
          customerName: orders.customerName,
          customerEmail: orders.customerEmail,
          clientCode: organization.clientCode,
        })
        .from(payments)
        .innerJoin(orders, eq(payments.orderId, orders.id))
        .leftJoin(organization, eq(payments.organizationId, organization.id))
        .where(scopedWhere)
        .orderBy(orderBy)
        .limit(page.size)
        .offset(page.page * page.size),
      this.db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(payments)
        .innerJoin(orders, eq(payments.orderId, orders.id))
        .where(scopedWhere),
    ]);

    return {
      items: rows.map((r) => ({ ...r, clientCode: scopeMode.mode === "all" ? r.clientCode : null })),
      page: page.page,
      size: page.size,
      total: count,
    };
  }
}

export const paymentsRepository = new PaymentsRepository(
  db,
  payments,
  payments.publicId,
  payments.id,
);
