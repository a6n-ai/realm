import { and, eq, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orders, users } from "@/db/schema";
import { isoDateInZone } from "@/lib/analytics/profitability";
import { lastTiffinSql, ordersListWhere } from "@/lib/services/orders.service";
import { countCustomers, countOrders, scopeToOrdersCondition } from "./metrics/orders";
import { dateWhere, localDay, ordersScope, type AnalyticsScope } from "./metrics/scope";

const intCount = sql<number>`cast(count(*) as int)`;
const distinctUsers = sql<number>`cast(count(distinct ${orders.userId}) as int)`;

export type CustomerStats = {
  /** Distinct customers with an order created in range (equals the Orders listing's customers). */
  customers: number;
  /** Distinct customers with an active order created in range or still running in range. */
  activeCustomers: number;
  /** Distinct customers whose active order has a paused delivery today. Not range-dependent. */
  pausedToday: number;
  /** Cancelled orders created in range (countOrders, equals the Orders listing). */
  cancelledOrders: number;
};

/** Orders matching the Orders listing for this scope, so these counts equal what the list shows. */
const listingWhere = (scope: AnalyticsScope) => ordersListWhere(scopeToOrdersCondition(scope), scope.orgIds);

const noOrgs = (scope: AnalyticsScope) => scope.orgIds !== "all" && scope.orgIds.length === 0;

export async function getCustomerStats(scope: AnalyticsScope, now = Date.now()): Promise<CustomerStats> {
  if (noOrgs(scope)) return { customers: 0, activeCustomers: 0, pausedToday: 0, cancelledOrders: 0 };
  const from = isoDateInZone(scope.fromMs, scope.tz);
  const to = isoDateInZone(scope.toMs, scope.tz);
  const today = isoDateInZone(now, scope.tz);

  // Not expressible as a listing condition (running-in-range and paused-today), so computed here
  // over the same org/facet scope; their tiles carry no drill link.
  const [[{ n: activeCustomers }], [{ n: pausedToday }], customers, cancelledOrders] = await Promise.all([
    db
      .select({ n: distinctUsers })
      .from(orders)
      .where(
        and(
          ordersScope(scope),
          eq(orders.status, "active"),
          or(
            dateWhere(orders.createdAt, { fromMs: scope.fromMs, toMs: scope.toMs }),
            and(sql`${orders.startDate} <= ${to}`, sql`${lastTiffinSql} >= ${from}`),
          ),
        ),
      ),
    db
      .select({ n: distinctUsers })
      .from(orders)
      .where(
        and(
          ordersScope(scope),
          eq(orders.status, "active"),
          sql`exists (select 1 from ${deliveries} where ${deliveries.orderId} = ${orders.id} and ${deliveries.status} = 'paused' and ${deliveries.deliveryDate} = ${today})`,
        ),
      ),
    countCustomers(scope),
    countOrders(scope, { status: ["cancelled"] }),
  ]);
  return { customers, activeCustomers, pausedToday, cancelledOrders };
}

/** Accounts created per local day. With franchise or facet filters, only accounts holding an order in scope. */
export async function getSignupTrend(scope: AnalyticsScope) {
  if (noOrgs(scope)) return [];
  const scoped = ordersScope(scope);
  // Grouped by ordinal: tz is a bound value, so repeating the expression would be a different parameter.
  const rows = await db
    .select({ iso: sql<string>`${localDay(users.createdAt, scope.tz)}::text`, n: intCount })
    .from(users)
    .where(
      and(
        eq(users.role, "user"),
        dateWhere(users.createdAt, { fromMs: scope.fromMs, toMs: scope.toMs }),
        scoped ? sql`exists (select 1 from ${orders} where ${orders.userId} = ${users.id} and ${scoped})` : undefined,
      ),
    )
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  return rows.map((r) => ({ day: DAY_LABEL.format(new Date(`${r.iso}T00:00:00Z`)), n: r.n }));
}

const DAY_LABEL = new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", timeZone: "UTC" });

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  active: "Active",
  waitlisted: "Waitlisted",
  cancelled: "Cancelled",
  paused: "Paused",
  completed: "Over",
};

/** Orders created in range by status; the same rows the Orders listing shows for the scope. */
export async function getSubscriptionMix(scope: AnalyticsScope) {
  if (noOrgs(scope)) return [];
  const rows = await db
    .select({ status: orders.status, n: intCount })
    .from(orders)
    .where(listingWhere(scope))
    .groupBy(orders.status);
  return rows.map((r) => ({ status: ORDER_STATUS_LABELS[r.status] ?? r.status, key: r.status, n: r.n }));
}

/** Customers (orders created in range, as in the Customers tile) per city. */
export async function getTopCities(limit = 8, scope: AnalyticsScope) {
  if (noOrgs(scope)) return [];
  const rows = await db
    .select({ city: users.city, n: distinctUsers })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .where(and(isNotNull(users.city), listingWhere(scope)))
    .groupBy(users.city)
    .orderBy(sql`count(distinct ${orders.userId}) desc`)
    .limit(limit);
  return rows.map((r) => ({ city: r.city ?? "Unknown", n: r.n }));
}
