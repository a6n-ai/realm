import { Suspense } from "react";
import { and, eq, exists, gt, ilike, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
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
const searchUser = alias(users, "search_user");
const searchOrder = alias(orders, "search_order");

// Redemptions rolled up per coupon. A staff code is used once; a rep daily coupon can be used
// up to its daily budget, so a plain join would repeat the coupon once per use.
const uses = db
  .select({
    couponId: couponRedemptions.couponId,
    count: sql<number>`cast(count(*) as int)`.as("use_count"),
    applied: sql<string>`sum(${couponRedemptions.amountApplied})`.as("applied"),
    firstUserId: sql<bigint>`min(${couponRedemptions.userId})`.as("first_user_id"),
    firstOrderId: sql<bigint>`min(${couponRedemptions.orderId})`.as("first_order_id"),
  })
  .from(couponRedemptions)
  .groupBy(couponRedemptions.couponId)
  .as("uses");

const SORT_COL = {
  code: coupons.code,
  amount: coupons.valueAmount,
  created: coupons.createdAt,
  expires: coupons.expiresAt,
} as const;

type StaffCodeSortColumn = keyof typeof SORT_COL;

const TYPE_OPTIONS = [
  { value: "rep_code", label: "Staff code" },
  { value: "rep_daily", label: "Daily coupon" },
];
const STATUS_OPTIONS = [
  { value: "unused", label: "Open" },
  { value: "used", label: "Used up" },
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
    { kind: "select", field: "type", label: "Type", options: TYPE_OPTIONS },
    { kind: "select", field: "status", label: "Status", options: STATUS_OPTIONS },
    { kind: "select", field: "issuer", label: "Issued by", options: staff.map((s) => ({ value: s.publicId, label: s.name ?? s.email ?? s.publicId })) },
    { kind: "search", fields: ["code", "issuer", "customer", "order"] },
  ];
  const { page } = parseFilterState(spec, sp);

  const used = sql`coalesce(${uses.count}, 0)`;
  const budget = sql`coalesce(${coupons.maxRedemptions}, 1)`;
  const left = sql`${used} < ${budget}`;
  const statusWhere: Record<string, SQL | undefined> = {
    used: sql`${used} >= ${budget}`,
    unused: and(left, eq(coupons.active, true), or(isNull(coupons.expiresAt), gt(coupons.expiresAt, now))),
    expired: and(left, eq(coupons.active, true), lte(coupons.expiresAt, now)),
    revoked: and(left, eq(coupons.active, false)),
  };

  const q = sp.q?.trim();
  const like = `%${q}%`;
  const type = TYPE_OPTIONS.find((t) => t.value === sp.type)?.value as "rep_code" | "rep_daily" | undefined;
  const base = and(
    type ? eq(coupons.kind, type) : inArray(coupons.kind, ["rep_code", "rep_daily"]),
    epochBoundsWhere(coupons.createdAt, sp),
    sp.issuer ? eq(users.publicId, sp.issuer) : undefined,
    q
      ? or(
          ilike(coupons.code, like),
          ilike(users.name, like),
          ilike(users.email, like),
          // Any customer or order that used the coupon, not only the first.
          exists(
            db
              .select({ one: sql`1` })
              .from(couponRedemptions)
              .innerJoin(searchUser, eq(searchUser.id, couponRedemptions.userId))
              .innerJoin(searchOrder, eq(searchOrder.id, couponRedemptions.orderId))
              .where(and(
                eq(couponRedemptions.couponId, coupons.id),
                or(ilike(searchUser.name, like), ilike(searchUser.email, like), ilike(searchOrder.publicId, like)),
              )),
          ),
        )
      : undefined,
  );
  // Cards count every status in range; the table also applies the status filter.
  const where = and(base, sp.status ? statusWhere[sp.status] : undefined);

  const from = () =>
    db
      .select({
        publicId: coupons.publicId,
        kind: coupons.kind,
        active: coupons.active,
        code: coupons.code,
        amount: coupons.valueAmount,
        capPct: coupons.capPct,
        capAmount: coupons.capAmount,
        maxUses: coupons.maxRedemptions,
        note: coupons.description,
        createdAt: coupons.createdAt,
        expiresAt: coupons.expiresAt,
        issuerName: users.name,
        issuerEmail: users.email,
        uses: uses.count,
        applied: uses.applied,
        customerName: customer.name,
        customerEmail: customer.email,
        orderPublicId: orders.publicId,
      })
      .from(coupons)
      .innerJoin(users, eq(users.id, coupons.ownerUserId))
      .leftJoin(uses, eq(uses.couponId, coupons.id))
      .leftJoin(customer, eq(customer.id, uses.firstUserId))
      .leftJoin(orders, eq(orders.id, uses.firstOrderId));

  const [rows, [agg], [{ total }]] = await Promise.all([
    from()
      .where(where)
      .orderBy(...pageOrder(sort.dir, SORT_COL[sort.column], coupons.id))
      .limit(page.size)
      .offset(page.page * page.size),
    db
      .select({
        issued: sql<number>`cast(count(*) as int)`,
        used: sql<number>`cast(count(*) filter (where ${statusWhere.used}) as int)`,
        open: sql<number>`cast(count(*) filter (where ${statusWhere.unused}) as int)`,
        given: sql<string>`coalesce(sum(${uses.applied}), 0)`,
      })
      .from(coupons)
      .innerJoin(users, eq(users.id, coupons.ownerUserId))
      .leftJoin(uses, eq(uses.couponId, coupons.id))
      .where(base),
    db
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(coupons)
      .innerJoin(users, eq(users.id, coupons.ownerUserId))
      .leftJoin(uses, eq(uses.couponId, coupons.id))
      .where(where),
  ]);

  const codes: IssuedCode[] = rows.map((c) => {
    const count = c.uses ?? 0;
    const maxUses = c.maxUses ?? 1;
    return {
      publicId: c.publicId,
      kind: c.kind === "rep_daily" ? "rep_daily" : "rep_code",
      code: c.code,
      amount: c.amount == null ? null : Number(c.amount),
      capPct: c.capPct == null ? null : Number(c.capPct),
      capAmount: c.capAmount == null ? null : Number(c.capAmount),
      note: c.note,
      createdAt: c.createdAt,
      expiresAt: c.expiresAt,
      issuer: c.issuerName ?? c.issuerEmail ?? "Unknown",
      uses: count,
      maxUses,
      status: count >= maxUses ? "used" : !c.active ? "revoked" : c.expiresAt != null && c.expiresAt <= now ? "expired" : "unused",
      customer: c.customerName ?? c.customerEmail,
      orderPublicId: c.orderPublicId,
      applied: c.applied == null ? null : Number(c.applied),
    };
  });

  const stats = [
    { label: "Codes issued", value: agg.issued.toLocaleString(), hint: "Staff codes and daily coupons" },
    { label: "Used up", value: agg.used.toLocaleString() },
    { label: "Open", value: agg.open.toLocaleString(), hint: "Uses left and still valid" },
    { label: "Expired or revoked", value: (agg.issued - agg.used - agg.open).toLocaleString() },
    { label: "Given", value: usd(Number(agg.given)), hint: "Applied on orders" },
  ];

  return <StaffCodes stats={stats} codes={codes} spec={spec} sort={sort} total={total} page={page.page} size={page.size} />;
}

export type { StaffCodeSortColumn };
