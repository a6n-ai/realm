import { eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, subscriptionPauses, users } from "@/db/schema";

const intCount = sql<number>`cast(count(*) as int)`;

export type CustomerStats = {
  totalCustomers: number;
  activeSubscriptions: number;
  pausedNow: number;
  cancelledEver: number;
};

export async function getCustomerStats(): Promise<CustomerStats> {
  const [[{ n: totalCustomers }], [{ n: activeSubscriptions }], [{ n: pausedNow }], [{ n: cancelledEver }]] =
    await Promise.all([
      db.select({ n: intCount }).from(users).where(eq(users.role, "user")),
      db.select({ n: intCount }).from(orders).where(eq(orders.status, "active")),
      // "Currently paused" = an open pause window (never resumed), not the order status
      // snapshot — a resumed order can still carry status 'paused' briefly mid-transition.
      db.select({ n: intCount }).from(subscriptionPauses).where(sql`${subscriptionPauses.resumedAt} is null`),
      db.select({ n: intCount }).from(orders).where(eq(orders.status, "cancelled")),
    ]);
  return { totalCustomers, activeSubscriptions, pausedNow, cancelledEver };
}

const dayTrunc = sql<Date>`date_trunc('day', to_timestamp(${users.createdAt} / 1000.0))`;

export async function getSignupTrend() {
  return db
    .select({ day: sql<string>`to_char(${dayTrunc}, 'Mon DD')`, n: intCount })
    .from(users)
    .where(eq(users.role, "user"))
    .groupBy(dayTrunc)
    .orderBy(dayTrunc);
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  active: "Active",
  waitlisted: "Waitlisted",
  cancelled: "Cancelled",
  paused: "Paused",
  completed: "Completed",
};

export async function getSubscriptionMix() {
  const rows = await db.select({ status: orders.status, n: intCount }).from(orders).groupBy(orders.status);
  return rows.map((r) => ({ status: ORDER_STATUS_LABELS[r.status] ?? r.status, n: r.n }));
}

export async function getTopCities(limit = 8) {
  const rows = await db
    .select({ city: users.city, n: intCount })
    .from(users)
    .where(isNotNull(users.city))
    .groupBy(users.city)
    .orderBy(sql`count(*) desc`)
    .limit(limit);
  return rows.map((r) => ({ city: r.city ?? "Unknown", n: r.n }));
}
