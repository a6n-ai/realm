import { Suspense } from "react";
import { and, eq, gt, ilike, inArray, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { pageOrder } from "@foundry/database";
import { parseFilterState, type FacetDef } from "@/components/ds";
import { db } from "@/db/client";
import { couponRedemptions, coupons, orders, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { parseSort, type SortState } from "@/lib/list/sort";
import { epochBoundsWhere, withListDates } from "@/lib/list/default-month";
import { usd } from "../discount-stats";
import { StaffCodes, StaffCodesSkeleton, type IssuedCode } from "./staff-codes";

const customer = alias(users, "customer");

const SORT_COL = {
  code: coupons.code,
  amount: coupons.valueAmount,
  created: coupons.createdAt,
  expires: coupons.expiresAt,
} as const;

type StaffCodeSortColumn = keyof typeof SORT_COL;

const STATUS_OPTIONS = [
  { value: "unused", label: "Open" },
  { value: "used", label: "Used" },
  { value: "expired", label: "Expired" },
  { value: "revoked", label: "Revoked" },
];

type SearchParams = Promise<Record<string, string | undefined>>;

export default function StaffCodesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<StaffCodesSkeleton />}>
      <StaffCodesData searchParams={searchParams} />
    </Suspense>
  );
}

async function StaffCodesData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await withListDates(await searchParams);
  const sort: SortState<StaffCodeSortColumn> = parseSort(sp, ["code", "amount", "created", "expires"], { column: "created", dir: "desc" });
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const now = Date.now();

  const staff = await db
    .select({ publicId: users.publicId, name: users.name, email: users.email })
    .from(users)
    .where(and(inArray(users.role, ["admin", "member"]), eq(users.isSystem, false)))
    .orderBy(users.name);

  const spec: FacetDef[] = [
    { kind: "select", field: "status", label: "Status", options: STATUS_OPTIONS },
    { kind: "select", field: "issuer", label: "Issued by", options: staff.map((s) => ({ value: s.publicId, label: s.name ?? s.email ?? s.publicId })) },
    { kind: "search", fields: ["code", "issuer", "customer", "order"] },
  ];
  const { page } = parseFilterState(spec, sp);

  const notExpired = or(isNull(coupons.expiresAt), gt(coupons.expiresAt, now));
  const statusWhere: Record<string, SQL | undefined> = {
    used: isNotNull(couponRedemptions.id),
    unused: and(isNull(couponRedemptions.id), eq(coupons.active, true), notExpired),
    expired: and(isNull(couponRedemptions.id), eq(coupons.active, true), lte(coupons.expiresAt, now)),
    revoked: and(isNull(couponRedemptions.id), eq(coupons.active, false)),
  };
  const q = sp.q?.trim();
  const base = and(
    eq(coupons.kind, "rep_code"),
    epochBoundsWhere(coupons.createdAt, sp),
    sp.issuer ? eq(users.publicId, sp.issuer) : undefined,
    q
      ? or(
          ilike(coupons.code, `%${q}%`),
          ilike(users.name, `%${q}%`),
          ilike(users.email, `%${q}%`),
          ilike(customer.name, `%${q}%`),
          ilike(customer.email, `%${q}%`),
          ilike(orders.publicId, `%${q}%`),
        )
      : undefined,
  );
  // Cards count every status in range; the table also applies the status filter.
  const where = and(base, sp.status ? statusWhere[sp.status] : undefined);

  // Each staff code allows one redemption, so the left joins never fan a code out.
  const [rows, [agg], [{ total }]] = await Promise.all([
    db
      .select({
        publicId: coupons.publicId,
        active: coupons.active,
        code: coupons.code,
        amount: coupons.valueAmount,
        note: coupons.description,
        createdAt: coupons.createdAt,
        expiresAt: coupons.expiresAt,
        issuerName: users.name,
        issuerEmail: users.email,
        customerName: customer.name,
        customerEmail: customer.email,
        orderPublicId: orders.publicId,
        applied: couponRedemptions.amountApplied,
      })
      .from(coupons)
      .innerJoin(users, eq(users.id, coupons.ownerUserId))
      .leftJoin(couponRedemptions, eq(couponRedemptions.couponId, coupons.id))
      .leftJoin(customer, eq(customer.id, couponRedemptions.userId))
      .leftJoin(orders, eq(orders.id, couponRedemptions.orderId))
      .where(where)
      .orderBy(...pageOrder(sort.dir, SORT_COL[sort.column], coupons.id))
      .limit(page.size)
      .offset(page.page * page.size),
    db
      .select({
        issued: sql<number>`cast(count(*) as int)`,
        used: sql<number>`cast(count(${couponRedemptions.id}) as int)`,
        open: sql<number>`cast(count(*) filter (where ${statusWhere.unused}) as int)`,
        given: sql<string>`coalesce(sum(${couponRedemptions.amountApplied}), 0)`,
      })
      .from(coupons)
      .innerJoin(users, eq(users.id, coupons.ownerUserId))
      .leftJoin(couponRedemptions, eq(couponRedemptions.couponId, coupons.id))
      .leftJoin(customer, eq(customer.id, couponRedemptions.userId))
      .leftJoin(orders, eq(orders.id, couponRedemptions.orderId))
      .where(base),
    db
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(coupons)
      .innerJoin(users, eq(users.id, coupons.ownerUserId))
      .leftJoin(couponRedemptions, eq(couponRedemptions.couponId, coupons.id))
      .leftJoin(customer, eq(customer.id, couponRedemptions.userId))
      .leftJoin(orders, eq(orders.id, couponRedemptions.orderId))
      .where(where),
  ]);

  const codes: IssuedCode[] = rows.map((c) => ({
    publicId: c.publicId,
    code: c.code,
    amount: Number(c.amount ?? 0),
    note: c.note,
    createdAt: c.createdAt,
    expiresAt: c.expiresAt,
    issuer: c.issuerName ?? c.issuerEmail ?? "Unknown",
    status: c.orderPublicId ? "used" : !c.active ? "revoked" : c.expiresAt != null && c.expiresAt <= now ? "expired" : "unused",
    customer: c.customerName ?? c.customerEmail,
    orderPublicId: c.orderPublicId,
    applied: c.applied == null ? null : Number(c.applied),
  }));

  const stats = [
    { label: "Codes issued", value: agg.issued.toLocaleString() },
    { label: "Used", value: agg.used.toLocaleString() },
    { label: "Open", value: agg.open.toLocaleString(), hint: "Unused and still valid" },
    { label: "Expired or revoked", value: (agg.issued - agg.used - agg.open).toLocaleString() },
    { label: "Given", value: usd(Number(agg.given)), hint: "Applied on orders" },
  ];

  return <StaffCodes stats={stats} codes={codes} spec={spec} sort={sort} total={total} page={page.page} size={page.size} />;
}

export type { StaffCodeSortColumn };
