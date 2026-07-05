import { Suspense } from "react";
import { asc, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { couponRedemptions, coupons, users, orders } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { parseSort, type SortState } from "@/lib/list/sort";
import { DiscountLogs } from "./discount-logs";

const customer = alias(users, "customer");
const redeemer = alias(users, "redeemer");

const SORT_COL = {
  time: couponRedemptions.createdAt,
  coupon: coupons.code,
  user: customer.email,
  amount: couponRedemptions.amountApplied,
  order: orders.publicId,
  redeemedBy: redeemer.email,
} as const;

type DiscountLogSortColumn = keyof typeof SORT_COL;

type SearchParams = Promise<{ sort?: string; dir?: string }>;

export default function DiscountLogsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<DiscountLogs.Skeleton />}>
        <DiscountLogsData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function DiscountLogsData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();

  const sort: SortState<DiscountLogSortColumn> = parseSort(
    await searchParams,
    ["time", "coupon", "user", "amount", "order", "redeemedBy"],
    { column: "time", dir: "desc" },
  );

  const col = SORT_COL[sort.column];
  const orderBy = sort.dir === "asc" ? asc(col) : desc(col);

  const [[agg], rows] = await Promise.all([
    db
      .select({
        redemptions: sql<number>`cast(count(*) as int)`,
        discounted: sql<string>`coalesce(sum(${couponRedemptions.amountApplied}), 0)`,
        coupons: sql<number>`cast(count(distinct ${couponRedemptions.couponId}) as int)`,
        customers: sql<number>`cast(count(distinct ${couponRedemptions.userId}) as int)`,
      })
      .from(couponRedemptions),
    db
    .select({
      publicId: couponRedemptions.publicId,
      createdAt: couponRedemptions.createdAt,
      amountApplied: couponRedemptions.amountApplied,
      code: coupons.code,
      email: customer.email,
      redeemedByEmail: redeemer.email,
      orderPublicId: orders.publicId,
    })
    .from(couponRedemptions)
    .leftJoin(coupons, eq(coupons.id, couponRedemptions.couponId))
    .leftJoin(customer, eq(customer.id, couponRedemptions.userId))
    .leftJoin(redeemer, eq(redeemer.id, couponRedemptions.redeemedBy))
    .leftJoin(orders, eq(orders.id, couponRedemptions.orderId))
    .orderBy(orderBy)
    .limit(100),
  ]);

  const stats = [
    { label: "Redemptions", value: agg.redemptions.toLocaleString() },
    { label: "Total discounted", value: `$${Number(agg.discounted).toFixed(2)}` },
    { label: "Coupons used", value: agg.coupons.toLocaleString() },
    { label: "Customers", value: agg.customers.toLocaleString() },
  ];

  return <DiscountLogs stats={stats} rows={rows} sort={sort} />;
}

export type { DiscountLogSortColumn };
