import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Condition } from "@foundry/commons/model/condition";
import type { Page, PageRequest } from "@foundry/commons/util/pagination";
import { conditionToSql, columnResolver } from "@foundry/database";
import { db } from "@/db/client";
import { cardPayClosed } from "@/lib/orders/display-status";
import { payPageLines } from "@/app/(customer)/me/pay/[paymentId]/lines";
import { couponRedemptions, coupons, deliveries, ledgerEntries, mealSizes, orders, payments, plans } from "@/db/schema";

export type BillPaymentSummary = {
  publicId: string;
  status: (typeof payments.status.enumValues)[number];
  method: (typeof payments.method.enumValues)[number];
  amount: string;
  note: string | null;
  providerRef: string | null;
  providerCheckedAt: number | null;
  cardBrand: string | null;
  cardLast4: string | null;
  surchargeAmount: string;
  /** A card payment the customer can still pay now (not settled, order not cancelled, link not expired or void). */
  cardPayable: boolean;
  /** An add-on link's own price lines; the order's tax lines do not describe it. */
  addonLines: { label: string; amount: number }[] | null;
};

export type CustomerBill = {
  publicId: string;
  deploymentId: string;
  planName: string;
  mealSizeName: string;
  /** Plan window as `YYYY-MM-DD`: the start date and the last scheduled tiffin (null before any is placed). */
  startDate: string;
  lastDeliveryDate: string | null;
  status: (typeof orders.status.enumValues)[number];
  total: string;
  createdAt: number;
  taxLines: { name: string; ratePct: number; amount: number }[];
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
  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        publicId: orders.publicId,
        deploymentId: orders.deploymentId,
        planName: plans.name,
        mealSizeName: mealSizes.name,
        startDate: orders.startDate,
        status: orders.status,
        total: orders.total,
        createdAt: orders.createdAt,
        id: orders.id,
        snapshot: orders.pricingSnapshot,
      })
      .from(orders)
      .innerJoin(plans, eq(orders.planId, plans.id))
      .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
      .where(where)
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(page.size)
      .offset(page.page * page.size),
    db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(orders)
      .where(where),
  ]);

  if (rows.length === 0) {
    return { items: [], page: page.page, size: page.size, total: count };
  }

  const orderIds = rows.map((r) => r.id);
  const lastRows = await db
    .select({ orderId: deliveries.orderId, last: sql<string>`max(${deliveries.deliveryDate})` })
    .from(deliveries)
    .where(inArray(deliveries.orderId, orderIds))
    .groupBy(deliveries.orderId);
  const lastByOrder = new Map(lastRows.map((r) => [r.orderId, r.last]));
  const payRows = await db
    .select({
      orderId: payments.orderId,
      publicId: payments.publicId,
      status: payments.status,
      method: payments.method,
      amount: payments.amount,
      note: payments.note,
      providerRef: payments.providerRef,
      providerCheckedAt: payments.providerCheckedAt,
      cardBrand: payments.cardBrand,
      cardLast4: payments.cardLast4,
      surchargeAmount: payments.surchargeAmount,
      expiresAt: payments.expiresAt,
      addonRequest: payments.addonRequest,
    })
    .from(payments)
    .where(inArray(payments.orderId, orderIds));

  const orderStatus = new Map(rows.map((r) => [r.id, r.status]));
  const now = Date.now();
  const paysByOrder = new Map<bigint, BillPaymentSummary[]>();
  for (const p of payRows) {
    const addon = p.addonRequest ? payPageLines(p, { pricingSnapshot: null }) : null;
    const list = paysByOrder.get(p.orderId) ?? [];
    list.push({
      publicId: p.publicId,
      status: p.status,
      method: p.method,
      amount: p.amount,
      note: p.note,
      providerRef: p.providerRef,
      providerCheckedAt: p.providerCheckedAt,
      cardBrand: p.cardBrand,
      cardLast4: p.cardLast4,
      surchargeAmount: p.surchargeAmount,
      cardPayable:
        p.method === "stripe" &&
        (p.status === "awaiting_payment" || p.status === "rejected") &&
        !cardPayClosed(orderStatus.get(p.orderId) ?? "", p.expiresAt, now),
      addonLines: addon ? [...addon.lines, ...addon.taxLines] : null,
    });
    paysByOrder.set(p.orderId, list);
  }

  return {
    items: rows.map(({ id, snapshot, ...r }) => ({
      ...r,
      lastDeliveryDate: lastByOrder.get(id) ?? null,
      taxLines: (snapshot as { taxLines?: CustomerBill["taxLines"] } | null)?.taxLines ?? [],
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

  const [rows, [{ count }]] = await Promise.all([
    db
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
      .orderBy(desc(ledgerEntries.createdAt), desc(ledgerEntries.id))
      .limit(page.size)
      .offset(page.page * page.size),
    db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(ledgerEntries)
      .where(where),
  ]);

  return {
    items: rows.map((r) => ({ ...r, orderPublicId: r.orderPublicId ?? null })),
    page: page.page,
    size: page.size,
    total: count,
  };
}

export type CustomerCouponUse = {
  publicId: string;
  /** Null for a staff discount: the rep's own coupon code is not the customer's to see. */
  code: string | null;
  name: string;
  saved: string;
  orderDeploymentId: string;
  createdAt: number;
};

// The signed-in customer's own coupon uses, newest first.
export async function myCouponsPage(userId: bigint, page: PageRequest): Promise<Page<CustomerCouponUse>> {
  const where = eq(couponRedemptions.userId, userId);
  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        publicId: couponRedemptions.publicId,
        code: coupons.code,
        kind: coupons.kind,
        name: coupons.name,
        saved: couponRedemptions.amountApplied,
        orderDeploymentId: orders.deploymentId,
        createdAt: couponRedemptions.createdAt,
      })
      .from(couponRedemptions)
      .innerJoin(coupons, eq(coupons.id, couponRedemptions.couponId))
      .innerJoin(orders, eq(orders.id, couponRedemptions.orderId))
      .where(where)
      .orderBy(desc(couponRedemptions.createdAt), desc(couponRedemptions.id))
      .limit(page.size)
      .offset(page.page * page.size),
    db.select({ count: sql<number>`cast(count(*) as int)` }).from(couponRedemptions).where(where),
  ]);
  return {
    items: rows.map(({ kind, ...r }) => (kind === "rep_daily" ? { ...r, code: null, name: "Staff discount" } : r)),
    page: page.page,
    size: page.size,
    total: count,
  };
}

export async function myCouponTotals(userId: bigint): Promise<{ uses: number; saved: string; lastUsedAt: number | null }> {
  const [row] = await db
    .select({
      uses: sql<number>`cast(count(*) as int)`,
      saved: sql<string>`coalesce(sum(${couponRedemptions.amountApplied}), 0)`,
      lastUsedAt: sql<number | null>`max(${couponRedemptions.createdAt})`,
    })
    .from(couponRedemptions)
    .where(eq(couponRedemptions.userId, userId));
  return { uses: row.uses, saved: row.saved, lastUsedAt: row.lastUsedAt == null ? null : Number(row.lastUsedAt) };
}
