import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Condition } from "@realm/commons/model/condition";
import type { Page, PageRequest } from "@realm/commons/util/pagination";
import { conditionToSql, columnResolver } from "@realm/database";
import { db } from "@/db/client";
import { ledgerEntries, orders, payments, plans } from "@/db/schema";

export type BillPaymentSummary = {
  publicId: string;
  status: (typeof payments.status.enumValues)[number];
  amount: string;
};

export type CustomerBill = {
  publicId: string;
  deploymentId: string;
  planName: string;
  status: (typeof orders.status.enumValues)[number];
  total: string;
  createdAt: number;
  payments: BillPaymentSummary[];
};

export type MoneyLedgerTx = {
  publicId: string;
  type: (typeof ledgerEntries.type.enumValues)[number];
  direction: (typeof ledgerEntries.direction.enumValues)[number];
  amount: string;
  memo: string | null;
  createdAt: number;
  orderPublicId: string | null;
};

/** Paginated subscription receipts for the signed-in customer (IDOR-gated). */
export async function myBillsPage(userId: bigint, page: PageRequest): Promise<Page<CustomerBill>> {
  const where = eq(orders.userId, userId);
  const rows = await db
    .select({
      publicId: orders.publicId,
      deploymentId: orders.deploymentId,
      planName: plans.name,
      status: orders.status,
      total: orders.total,
      createdAt: orders.createdAt,
      id: orders.id,
    })
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .where(where)
    .orderBy(desc(orders.createdAt))
    .limit(page.size)
    .offset(page.page * page.size);

  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(orders)
    .where(where);

  if (rows.length === 0) {
    return { items: [], page: page.page, size: page.size, total: count };
  }

  const orderIds = rows.map((r) => r.id);
  const payRows = await db
    .select({
      orderId: payments.orderId,
      publicId: payments.publicId,
      status: payments.status,
      amount: payments.amount,
    })
    .from(payments)
    .where(inArray(payments.orderId, orderIds));

  const paysByOrder = new Map<bigint, BillPaymentSummary[]>();
  for (const p of payRows) {
    const list = paysByOrder.get(p.orderId) ?? [];
    list.push({ publicId: p.publicId, status: p.status, amount: p.amount });
    paysByOrder.set(p.orderId, list);
  }

  return {
    items: rows.map(({ id, ...r }) => ({
      ...r,
      payments: paysByOrder.get(id) ?? [],
    })),
    page: page.page,
    size: page.size,
    total: count,
  };
}

/** Paginated money ledger (`ledger_entries`) for the signed-in customer (IDOR-gated). */
export async function myMoneyLedgerPage(
  userId: bigint,
  condition: Condition | undefined,
  page: PageRequest,
): Promise<Page<MoneyLedgerTx>> {
  const facet = conditionToSql(
    condition,
    columnResolver({
      type: ledgerEntries.type,
      direction: ledgerEntries.direction,
      createdAt: ledgerEntries.createdAt,
    }),
  );
  const where = facet ? and(eq(ledgerEntries.userId, userId), facet) : eq(ledgerEntries.userId, userId);

  const rows = await db
    .select({
      publicId: ledgerEntries.publicId,
      type: ledgerEntries.type,
      direction: ledgerEntries.direction,
      amount: ledgerEntries.amount,
      memo: ledgerEntries.memo,
      createdAt: ledgerEntries.createdAt,
      orderPublicId: orders.publicId,
    })
    .from(ledgerEntries)
    .leftJoin(orders, eq(ledgerEntries.orderId, orders.id))
    .where(where)
    .orderBy(desc(ledgerEntries.createdAt))
    .limit(page.size)
    .offset(page.page * page.size);

  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(ledgerEntries)
    .where(where);

  return {
    items: rows.map((r) => ({ ...r, orderPublicId: r.orderPublicId ?? null })),
    page: page.page,
    size: page.size,
    total: count,
  };
}
