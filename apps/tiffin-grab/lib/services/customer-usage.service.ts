// Usage analytics for a single logged-in customer (app/(customer)/me/usage) — every
// query here is scoped to one userId and, optionally, a [from, to] epoch-ms window.
// Distinct from lib/services/analytics/* (staff-facing, business-wide aggregates).
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, ledgerEntries, orders, plans } from "@/db/schema";
import { deliveredTiffinCount } from "./tiffin-counts";

export type UsageSummary = {
  tiffinsDelivered: number;
  subscriptionCount: number;
  plans: { name: string; orders: number }[];
  totalSpent: string;
  totalSaved: string;
};

async function tiffinsDelivered(userId: bigint, from: number, to: number, nowMs: number): Promise<number> {
  const fromIso = new Date(from).toISOString().slice(0, 10);
  const toIso = new Date(to).toISOString().slice(0, 10);
  const rows = await db
    .select({
      persons: orders.persons,
      status: deliveries.status,
      cutoffAt: deliveries.cutoffAt,
      makeupForDeliveryId: deliveries.makeupForDeliveryId,
      pooledAt: deliveries.pooledAt,
    })
    .from(deliveries)
    .innerJoin(orders, eq(deliveries.orderId, orders.id))
    .where(
      and(
        eq(orders.userId, userId),
        eq(deliveries.status, "scheduled"),
        gte(deliveries.deliveryDate, fromIso),
        lte(deliveries.deliveryDate, toIso),
      ),
    );
  // deliveredTiffinCount is pure/row-agnostic about persons, so call it once per
  // row rather than batching — orders in the window can carry different persons.
  return rows.reduce((sum, r) => sum + deliveredTiffinCount(r.persons, [r], nowMs), 0);
}

async function subscriptionsAndPlans(
  userId: bigint,
  from: number,
  to: number,
): Promise<{ subscriptionCount: number; plans: { name: string; orders: number }[] }> {
  const rows = await db
    .select({ planName: plans.name })
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .where(and(eq(orders.userId, userId), gte(orders.createdAt, from), lte(orders.createdAt, to)));
  const byPlan = new Map<string, number>();
  for (const r of rows) byPlan.set(r.planName, (byPlan.get(r.planName) ?? 0) + 1);
  return {
    subscriptionCount: rows.length,
    plans: [...byPlan.entries()]
      .map(([name, count]) => ({ name, orders: count }))
      .sort((a, b) => b.orders - a.orders),
  };
}

// Total spent = payment credits − refund debits; total saved = discount debits
// (coupon + wallet-coin redemptions both land as `discount` rows — see
// ledgerService.totalSpent/totalSavings for the unscoped equivalents this mirrors).
async function spendAndSavings(userId: bigint, from: number, to: number): Promise<{ spent: string; saved: string }> {
  const [row] = await db
    .select({
      paid: sql<string>`coalesce(sum(case when ${ledgerEntries.type} = 'payment' then ${ledgerEntries.amount} else 0 end), 0)`,
      refunded: sql<string>`coalesce(sum(case when ${ledgerEntries.type} = 'refund' then ${ledgerEntries.amount} else 0 end), 0)`,
      discounted: sql<string>`coalesce(sum(case when ${ledgerEntries.type} = 'discount' then ${ledgerEntries.amount} else 0 end), 0)`,
    })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.userId, userId), gte(ledgerEntries.createdAt, from), lte(ledgerEntries.createdAt, to)));
  const spent = (Number(row?.paid ?? 0) - Number(row?.refunded ?? 0)).toFixed(2);
  const saved = Number(row?.discounted ?? 0).toFixed(2);
  return { spent, saved };
}

export async function getCustomerUsage(userId: bigint, from: number, to: number): Promise<UsageSummary> {
  const now = Date.now();
  const [delivered, subs, money] = await Promise.all([
    tiffinsDelivered(userId, from, to, now),
    subscriptionsAndPlans(userId, from, to),
    spendAndSavings(userId, from, to),
  ]);
  return {
    tiffinsDelivered: delivered,
    subscriptionCount: subs.subscriptionCount,
    plans: subs.plans,
    totalSpent: money.spent,
    totalSaved: money.saved,
  };
}
