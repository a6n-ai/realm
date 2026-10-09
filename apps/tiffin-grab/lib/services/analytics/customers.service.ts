import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, subscriptionPauses, users } from "@/db/schema";
import {
  epochRangeWhere,
  ordersMatchFilters,
  type AnalyticsFilters,
} from "./shared-filters";

const intCount = sql<number>`cast(count(*) as int)`;

export type CustomerStats = {
  totalCustomers: number;
  activeSubscriptions: number;
  pausedNow: number;
  cancelledEver: number;
};

export async function getCustomerStats(
  filters: AnalyticsFilters = { plans: [], mealSizes: [], zones: [] },
): Promise<CustomerStats> {
  const orderDim = ordersMatchFilters(filters);
  const signupRange = epochRangeWhere(users.createdAt, filters);
  const [[{ n: totalCustomers }], [{ n: activeSubscriptions }], [{ n: pausedNow }], [{ n: cancelledEver }]] =
    await Promise.all([
      db.select({ n: intCount }).from(users).where(and(eq(users.role, "user"), signupRange)),
      db.select({ n: intCount }).from(orders).where(and(eq(orders.status, "active"), orderDim)),
      // "Currently paused" = an open pause window (never resumed), not the order status
      // snapshot — a resumed order can still carry status 'paused' briefly mid-transition.
      db
        .select({ n: intCount })
        .from(subscriptionPauses)
        .innerJoin(orders, eq(subscriptionPauses.orderId, orders.id))
        .where(and(sql`${subscriptionPauses.resumedAt} is null`, orderDim)),
      db.select({ n: intCount }).from(orders).where(and(eq(orders.status, "cancelled"), orderDim)),
    ]);
  return { totalCustomers, activeSubscriptions, pausedNow, cancelledEver };
}

const dayTrunc = sql<Date>`date_trunc('day', to_timestamp(${users.createdAt} / 1000.0))`;

export async function getSignupTrend(filters: AnalyticsFilters = { plans: [], mealSizes: [], zones: [] }) {
  return db
    .select({ day: sql<string>`to_char(${dayTrunc}, 'Mon DD')`, n: intCount })
    .from(users)
    .where(and(eq(users.role, "user"), epochRangeWhere(users.createdAt, filters)))
    .groupBy(dayTrunc)
    .orderBy(dayTrunc);
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  active: "Active",
  waitlisted: "Waitlisted",
  cancelled: "Cancelled",
  paused: "Paused",
  completed: "Over",
};

export async function getSubscriptionMix(filters: AnalyticsFilters = { plans: [], mealSizes: [], zones: [] }) {
  const rows = await db
    .select({ status: orders.status, n: intCount })
    .from(orders)
    .where(ordersMatchFilters(filters))
    .groupBy(orders.status);
  return rows.map((r) => ({
    status: ORDER_STATUS_LABELS[r.status] ?? r.status,
    key: r.status,
    n: r.n,
  }));
}

export async function getTopCities(
  limit = 8,
  filters: AnalyticsFilters = { plans: [], mealSizes: [], zones: [] },
) {
  const orderDim = ordersMatchFilters(filters);
  // When plan/size/zone are set, cities come from customers who hold matching orders.
  if (orderDim) {
    const rows = await db
      .select({ city: users.city, n: intCount })
      .from(users)
      .innerJoin(orders, eq(orders.userId, users.id))
      .where(and(isNotNull(users.city), orderDim, epochRangeWhere(users.createdAt, filters)))
      .groupBy(users.city)
      .orderBy(sql`count(*) desc`)
      .limit(limit);
    return rows.map((r) => ({ city: r.city ?? "Unknown", n: r.n }));
  }
  const rows = await db
    .select({ city: users.city, n: intCount })
    .from(users)
    .where(and(isNotNull(users.city), epochRangeWhere(users.createdAt, filters)))
    .groupBy(users.city)
    .orderBy(sql`count(*) desc`)
    .limit(limit);
  return rows.map((r) => ({ city: r.city ?? "Unknown", n: r.n }));
}
