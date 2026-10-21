import { Suspense } from "react";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { pageOrder } from "@foundry/database";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { couponRedemptions, coupons, users, orders } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { parseSort, type SortState } from "@/lib/list/sort";
import { parseFilterState, type FacetDef } from "@/components/ds";
import { ALL_KINDS, KIND_LABELS } from "../kind-labels";
import { epochBoundsWhere, withListDates } from "@/lib/list/default-month";
import { DiscountLogs, DiscountLogsSkeleton } from "./discount-logs";
import { usd } from "../discount-stats";

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

const SPEC: FacetDef[] = [
  { kind: "select", field: "kind", label: "Kind", options: ALL_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] })) },
  { kind: "search", fields: ["coupon", "user", "redeemedBy", "order"] },
];

type SearchParams = Promise<Record<string, string | undefined>>;

export default function DiscountLogsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="grid gap-6">
      <Suspense fallback={<DiscountLogsSkeleton />}>
        <DiscountLogsData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function DiscountLogsData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();

  const sp = await withListDates(await searchParams);
  const sort: SortState<DiscountLogSortColumn> = parseSort(
    sp,
    ["time", "coupon", "user", "amount", "order", "redeemedBy"],
    { column: "time", dir: "desc" },
  );

  const { page } = parseFilterState(SPEC, sp);
  const kind = ALL_KINDS.find((k) => k === sp.kind);
  const q = sp.q?.trim();
  const where = and(
    epochBoundsWhere(couponRedemptions.createdAt, sp),
    kind ? eq(coupons.kind, kind) : undefined,
    q
      ? or(
          ilike(coupons.code, `%${q}%`),
          ilike(customer.email, `%${q}%`),
          ilike(redeemer.email, `%${q}%`),
          ilike(orders.publicId, `%${q}%`),
        )
      : undefined,
  );

  const [[agg], rows, [{ total }]] = await Promise.all([
    db
      .select({
        redemptions: sql<number>`cast(count(*) as int)`,
        discounted: sql<string>`coalesce(sum(${couponRedemptions.amountApplied}), 0)`,
        coupons: sql<number>`cast(count(distinct ${couponRedemptions.couponId}) as int)`,
        customers: sql<number>`cast(count(distinct ${couponRedemptions.userId}) as int)`,
      })
      .from(couponRedemptions)
      .leftJoin(coupons, eq(coupons.id, couponRedemptions.couponId))
      .leftJoin(customer, eq(customer.id, couponRedemptions.userId))
      .leftJoin(redeemer, eq(redeemer.id, couponRedemptions.redeemedBy))
      .leftJoin(orders, eq(orders.id, couponRedemptions.orderId))
      .where(where),
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
      .where(where)
      .orderBy(...pageOrder(sort.dir, SORT_COL[sort.column], couponRedemptions.id))
      .limit(page.size)
      .offset(page.page * page.size),
    db
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(couponRedemptions)
      .leftJoin(coupons, eq(coupons.id, couponRedemptions.couponId))
      .leftJoin(customer, eq(customer.id, couponRedemptions.userId))
      .leftJoin(redeemer, eq(redeemer.id, couponRedemptions.redeemedBy))
      .leftJoin(orders, eq(orders.id, couponRedemptions.orderId))
      .where(where),
  ]);

  // Cards follow the same date range and search as the table.
  const discounted = Number(agg.discounted);
  const stats = [
    { label: "Redemptions", value: agg.redemptions.toLocaleString() },
    { label: "Total discounted", value: usd(discounted) },
    { label: "Avg discount", value: usd(agg.redemptions ? discounted / agg.redemptions : 0) },
    { label: "Coupons used", value: agg.coupons.toLocaleString() },
    { label: "Customers", value: agg.customers.toLocaleString() },
  ];

  return <DiscountLogs stats={stats} rows={rows} spec={SPEC} sort={sort} total={total} page={page.page} size={page.size} />;
}

export type { DiscountLogSortColumn };
