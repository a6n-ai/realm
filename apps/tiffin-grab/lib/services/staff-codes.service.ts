import { and, eq, exists, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { pageOrder } from "@foundry/database";
import { db } from "@/db/client";
import { couponRedemptions, coupons, orders, users } from "@/db/schema";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { couponExpiredSql, couponLiveSql } from "@/lib/coupons/status-sql";
import { epochBoundsWhere } from "@/lib/list/default-month";
import type { SortState } from "@/lib/list/sort";

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

export type StaffCodeSortColumn = keyof typeof SORT_COL;
export const STAFF_CODE_SORT_COLUMNS = Object.keys(SORT_COL) as StaffCodeSortColumn[];
export type StaffCodeKind = "rep_code" | "rep_daily";

export async function listCodeIssuers() {
  return db
    .select({ publicId: users.publicId, name: users.name, email: users.email })
    .from(users)
    .where(and(inArray(users.role, STAFF_ROLES), eq(users.isSystem, false)))
    .orderBy(users.name);
}

export async function listStaffCodes(opts: {
  now: number;
  dates: { from?: string; to?: string };
  type?: StaffCodeKind;
  issuer?: string;
  q?: string;
  status?: string;
  sort: SortState<StaffCodeSortColumn>;
  size: number;
  offset: number;
}) {
  const { now, sort } = opts;
  const used = sql`coalesce(${uses.count}, 0)`;
  const budget = sql`coalesce(${coupons.maxRedemptions}, 1)`;
  const left = sql`${used} < ${budget}`;
  const statusWhere: Record<string, SQL | undefined> = {
    used: sql`${used} >= ${budget}`,
    unused: and(left, couponLiveSql(now)),
    expired: and(left, couponExpiredSql(now)),
    revoked: and(left, eq(coupons.active, false)),
  };

  const q = opts.q?.trim();
  const like = `%${q}%`;
  const base = and(
    opts.type ? eq(coupons.kind, opts.type) : inArray(coupons.kind, ["rep_code", "rep_daily"]),
    epochBoundsWhere(coupons.createdAt, opts.dates),
    opts.issuer ? eq(users.publicId, opts.issuer) : undefined,
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
  const where = and(base, opts.status ? statusWhere[opts.status] : undefined);

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
      .limit(opts.size)
      .offset(opts.offset),
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
  return { rows, agg, total };
}
