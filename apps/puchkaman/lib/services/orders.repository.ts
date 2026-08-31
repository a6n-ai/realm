import { UpdatableRepository } from "@foundry/database";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { orderItems, orders, organization, payments, type OrderPricingSnapshot } from "@/db/schema";
import type { SortState } from "@/lib/list/sort";
import { resolveOrgScopeMode } from "@/lib/services/org-scope";

export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;

export type OrderSortColumn = "customer" | "status" | "total" | "created" | "paidAt";

export type OrderListRow = {
  publicId: string;
  customerName: string;
  customerEmail: string;
  status: OrderRow["status"];
  fulfillment: OrderRow["fulfillment"];
  total: string;
  cloverOrderId: string | null;
  createdAt: number;
  paidAt: number | null;
  paymentStatus: PaymentRow["status"] | null;
  paymentMethod: PaymentRow["method"] | null;
  /** Null when franchise-scoped (the caller's own org is implicit); populated
   *  for a brand admin's cross-franchise "all" view. */
  clientCode: string | null;
};

const ORDER_SORT_COL = {
  customer: orders.customerName,
  status: orders.status,
  total: orders.total,
  created: orders.createdAt,
  paidAt: orders.paidAt,
} as const;

/**
 * Orders DAO — UpdatableRepository + joins for admin list / checkout reads.
 */
export class OrdersRepository extends UpdatableRepository<typeof orders> {
  /** Unfiltered recent page (kept for simple callers). */
  async listRecent(limit = 50, offset = 0): Promise<{ rows: OrderListRow[]; total: number }> {
    return this.queryPage(undefined, { column: "created", dir: "desc" }, {
      page: Math.floor(offset / Math.max(limit, 1)),
      size: limit,
    }).then((p) => ({ rows: p.items, total: p.total }));
  }

  /**
   * Admin list with SQL `where`, sort, and offset pagination.
   * Payment status/method are attached from the latest payment per order
   * (create path writes one row; settle updates in place).
   */
  async queryPage(
    where: SQL | undefined,
    sort: SortState<OrderSortColumn>,
    page: { page: number; size: number },
  ): Promise<{ items: OrderListRow[]; page: number; size: number; total: number }> {
    const col = ORDER_SORT_COL[sort.column] ?? orders.createdAt;
    const orderBy = sort.dir === "asc" ? asc(col) : desc(col);
    const scopeMode = await resolveOrgScopeMode();
    const scopedWhere =
      scopeMode.mode === "org" ? and(where, eq(orders.organizationId, scopeMode.orgId)) : where;

    const [rawRows, [{ count }]] = await Promise.all([
      this.db
        .select({
          id: orders.id,
          publicId: orders.publicId,
          customerName: orders.customerName,
          customerEmail: orders.customerEmail,
          status: orders.status,
          fulfillment: orders.fulfillment,
          total: orders.total,
          cloverOrderId: orders.cloverOrderId,
          createdAt: orders.createdAt,
          paidAt: orders.paidAt,
          clientCode: organization.clientCode,
        })
        .from(orders)
        .leftJoin(organization, eq(orders.organizationId, organization.id))
        .where(scopedWhere)
        .orderBy(orderBy)
        .limit(page.size)
        .offset(page.page * page.size),
      this.db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(orders)
        .where(scopedWhere),
    ]);

    const paymentByOrder = await this.latestPaymentsByOrderIds(rawRows.map((r) => r.id));

    const items: OrderListRow[] = rawRows.map((r) => {
      const pay = paymentByOrder.get(String(r.id));
      return {
        publicId: r.publicId,
        customerName: r.customerName,
        customerEmail: r.customerEmail,
        status: r.status,
        fulfillment: r.fulfillment,
        total: r.total,
        cloverOrderId: r.cloverOrderId,
        createdAt: r.createdAt,
        paidAt: r.paidAt,
        paymentStatus: pay?.status ?? null,
        paymentMethod: pay?.method ?? null,
        clientCode: scopeMode.mode === "all" ? r.clientCode : null,
      };
    });

    return { items, page: page.page, size: page.size, total: count };
  }

  private async latestPaymentsByOrderIds(
    orderIds: bigint[],
  ): Promise<Map<string, { status: PaymentRow["status"]; method: PaymentRow["method"] }>> {
    const map = new Map<string, { status: PaymentRow["status"]; method: PaymentRow["method"] }>();
    if (orderIds.length === 0) return map;

    const pays = await this.db
      .select({
        orderId: payments.orderId,
        status: payments.status,
        method: payments.method,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .where(inArray(payments.orderId, orderIds))
      .orderBy(desc(payments.createdAt));

    for (const p of pays) {
      const key = String(p.orderId);
      if (!map.has(key)) {
        map.set(key, { status: p.status, method: p.method });
      }
    }
    return map;
  }

  async findByCloverOrderId(cloverOrderId: string): Promise<OrderRow | null> {
    const [row] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.cloverOrderId, cloverOrderId))
      .limit(1);
    return row ?? null;
  }

  async findOrderByCloverChargeId(cloverChargeId: string): Promise<OrderRow | null> {
    const [row] = await this.db
      .select({ order: orders })
      .from(payments)
      .innerJoin(orders, eq(payments.orderId, orders.id))
      .where(eq(payments.cloverChargeId, cloverChargeId))
      .limit(1);
    return row?.order ?? null;
  }

  async findItemsByOrderId(orderId: bigint): Promise<OrderItemRow[]> {
    return this.db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  }

  async findPaymentsByOrderId(orderId: bigint): Promise<PaymentRow[]> {
    return this.db.select().from(payments).where(eq(payments.orderId, orderId));
  }

  async insertItems(
    tx: {
      insert: typeof db.insert;
    },
    rows: {
      orderId: bigint;
      productId: bigint;
      cloverItemId: string;
      name: string;
      unitPrice: string;
      quantity: number;
      lineTotal: string;
    }[],
  ): Promise<void> {
    if (rows.length === 0) return;
    await tx.insert(orderItems).values(rows);
  }
}

export const ordersRepository = new OrdersRepository(db, orders, orders.publicId, orders.id);

export type { OrderPricingSnapshot };
