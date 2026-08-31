import { and, asc, desc, eq, exists, sql } from "drizzle-orm";
import type { Condition } from "@realm/commons/model/condition";
import type { Page, PageRequest } from "@realm/commons/util/pagination";
import { columnResolver, conditionToSql } from "@realm/database";
import { db } from "@/db/client";
import { orders, users } from "@/db/schema";
import type { SortState } from "@/lib/list/sort";
import { resolveOrgScopeMode } from "@/lib/services/org-scope";

export type CustomerRow = {
  publicId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  createdAt: number;
  orderCount: number;
  totalSpent: string;
  lastOrderAt: number | null;
};

export type CustomerSortColumn = "name" | "email" | "joined" | "orders" | "spent" | "lastOrder";

const SPENT_SQL = sql<string>`coalesce(sum(${orders.total}) filter (where ${orders.status} in ('paid','fulfilled')), 0)`;

/**
 * Customers = `users` rows with role `user`. They are created by checkout (guest
 * orders provision an owner) and by the public create-account flow, so this list
 * is the operator's view of everyone who can sign in at /me — not of everyone
 * who ever ordered (a phone-in order taken by staff has no customer row of its
 * own until an email is attached).
 *
 * Spend counts `paid` and `fulfilled` orders only: pending and failed ones are
 * quotes, not money, and would make the column disagree with Finance.
 */
export async function listCustomersPage(
  condition: Condition | undefined,
  page: PageRequest,
  sort: SortState<CustomerSortColumn> = { column: "joined", dir: "desc" },
): Promise<Page<CustomerRow>> {
  const scopeMode = await resolveOrgScopeMode();
  // A brand admin (mode "all") sees every customer. A franchise admin (mode
  // "org") sees only customers with at least one order under that franchise —
  // customers themselves carry no organizationId (they can order from more
  // than one location), so scoping goes through an EXISTS on their orders.
  const orgFilter =
    scopeMode.mode === "org"
      ? exists(
          db
            .select({ one: sql`1` })
            .from(orders)
            .where(and(eq(orders.userId, users.id), eq(orders.organizationId, scopeMode.orgId))),
        )
      : undefined;

  const where = and(
    eq(users.role, "user"),
    orgFilter,
    conditionToSql(
      condition,
      columnResolver({
        name: users.name,
        email: users.email,
        phone: users.phone,
        status: users.status,
        createdAt: users.createdAt,
      }),
    ),
  );

  const SORT_COL = {
    name: users.name,
    email: users.email,
    joined: users.createdAt,
    orders: sql`count(${orders.id})`,
    spent: SPENT_SQL,
    lastOrder: sql`max(${orders.createdAt})`,
  } as const;
  const col = SORT_COL[sort.column] ?? users.createdAt;

  // Scoping the join itself (not just the EXISTS above) so order count/spend
  // reflect only the selected client's orders too, not every order this
  // customer ever placed across every franchise.
  const orderJoin =
    scopeMode.mode === "org"
      ? and(eq(orders.userId, users.id), eq(orders.organizationId, scopeMode.orgId))
      : eq(orders.userId, users.id);

  // The leftJoin fans out one row per order, so the total has to be counted on
  // the base table with the identical `where` — never off this query.
  const [items, [{ count }]] = await Promise.all([
    db
      .select({
        publicId: users.publicId,
        name: users.name,
        email: users.email,
        phone: users.phone,
        status: users.status,
        createdAt: users.createdAt,
        orderCount: sql<number>`count(${orders.id})`.mapWith(Number),
        totalSpent: SPENT_SQL,
        lastOrderAt: sql<number | null>`max(${orders.createdAt})`,
      })
      .from(users)
      .leftJoin(orders, orderJoin)
      .where(where)
      .groupBy(users.id, users.publicId, users.name, users.email, users.phone, users.status, users.createdAt)
      .orderBy(sort.dir === "asc" ? asc(col) : desc(col))
      .limit(page.size)
      .offset(page.page * page.size),
    db.select({ count: sql<number>`cast(count(*) as int)` }).from(users).where(where),
  ]);

  return { items, page: page.page, size: page.size, total: count };
}

export type CustomerStats = {
  total: number;
  active: number;
  withOrders: number;
  newThisWeek: number;
};

export async function customerStats(now = Date.now()): Promise<CustomerStats> {
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const scopeMode = await resolveOrgScopeMode();
  const ocWhere = scopeMode.mode === "org" ? eq(orders.organizationId, scopeMode.orgId) : undefined;
  const oc = db
    .select({ userId: orders.userId, c: sql<number>`count(*)`.as("c") })
    .from(orders)
    .where(ocWhere)
    .groupBy(orders.userId)
    .as("oc");

  // "Total"/"active"/"new this week" describe the account itself, so those
  // stay unscoped even in org mode — only "withOrders" (this client's orders)
  // is client-specific.
  const [row] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      active: sql<number>`count(*) filter (where ${users.status} = 'active')`.mapWith(Number),
      withOrders: sql<number>`count(*) filter (where ${oc.c} > 0)`.mapWith(Number),
      newThisWeek: sql<number>`count(*) filter (where ${users.createdAt} >= ${weekAgo})`.mapWith(Number),
    })
    .from(users)
    .leftJoin(oc, eq(oc.userId, users.id))
    .where(eq(users.role, "user"));

  return row;
}

export type CustomerDetail = {
  publicId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  createdAt: number;
  orders: {
    publicId: string;
    status: string;
    total: string;
    createdAt: number;
  }[];
  orderCount: number;
  totalSpent: string;
};

/** One customer plus their order history. Null when the id is not a customer. */
export async function getCustomerDetail(publicId: string): Promise<CustomerDetail | null> {
  const [user] = await db
    .select({
      id: users.id,
      publicId: users.publicId,
      name: users.name,
      email: users.email,
      phone: users.phone,
      status: users.status,
      role: users.role,
      emailVerified: users.emailVerified,
      phoneVerified: users.phoneVerified,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.publicId, publicId))
    .limit(1);
  // Staff rows are managed under Settings → Users; surfacing one here would
  // offer a customer view of an account that has no customer side.
  if (!user || user.role !== "user") return null;

  const orderRows = await db
    .select({
      publicId: orders.publicId,
      status: orders.status,
      total: orders.total,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.userId, user.id))
    .orderBy(desc(orders.createdAt))
    .limit(50);

  const [{ spent, count }] = await db
    .select({
      spent: sql<string>`coalesce(sum(${orders.total}) filter (where ${orders.status} in ('paid','fulfilled')), 0)`,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(orders)
    .where(eq(orders.userId, user.id));

  const { id: _id, role: _role, ...rest } = user;
  return { ...rest, orders: orderRows, orderCount: count, totalSpent: spent };
}
