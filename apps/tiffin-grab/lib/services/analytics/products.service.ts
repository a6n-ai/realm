import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, mealSelections, mealSizes, orders, payments, plans } from "@/db/schema";

const SETTLED = ["paid", "simulated_paid"] as const;

const intCount = sql<number>`cast(count(*) as int)`;

export type ProductStats = {
  totalSelections: number;
  distinctDishes: number;
  topDish: string | null;
};

export async function getProductStats(): Promise<ProductStats> {
  const [[{ n: totalSelections }], [{ n: distinctDishes }], top] = await Promise.all([
    db.select({ n: intCount }).from(mealSelections),
    db.select({ n: sql<number>`cast(count(distinct ${mealSelections.dishId}) as int)` }).from(mealSelections),
    db
      .select({ name: dishes.name, n: intCount })
      .from(mealSelections)
      .innerJoin(dishes, eq(mealSelections.dishId, dishes.id))
      .groupBy(dishes.name)
      .orderBy(sql`count(*) desc`)
      .limit(1),
  ]);
  return { totalSelections, distinctDishes, topDish: top[0]?.name ?? null };
}

export async function getTopDishes(limit = 8) {
  return db
    .select({ dish: dishes.name, n: intCount })
    .from(mealSelections)
    .innerJoin(dishes, eq(mealSelections.dishId, dishes.id))
    .groupBy(dishes.name)
    .orderBy(sql`count(*) desc`)
    .limit(limit);
}

export type PaidPlanRow = { plan: string; key: string; orders: number; paid: number };

/** Orders that have a settled payment, with the money those payments brought in. */
export async function getOrdersByPlan(): Promise<PaidPlanRow[]> {
  const rows = await db
    .select({
      plan: plans.name,
      key: plans.key,
      orders: sql<number>`cast(count(distinct ${orders.id}) as int)`,
      paid: sql<number>`coalesce(sum(${payments.amount}::float8), 0)`,
    })
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .innerJoin(payments, eq(payments.orderId, orders.id))
    .where(inArray(payments.status, [...SETTLED]))
    .groupBy(plans.name, plans.key)
    .orderBy(sql`sum(${payments.amount}) desc`);
  return rows.map((r) => ({ ...r, paid: Math.round(Number(r.paid) * 100) / 100 }));
}

const TIER_LABELS: Record<string, string> = { budget: "Budget", medium: "Medium", premium: "Premium" };

export type PaidTierRow = { tier: string; key: string; orders: number; paid: number };

export async function getOrdersByTier(): Promise<PaidTierRow[]> {
  const rows = await db
    .select({
      tier: mealSizes.tier,
      orders: sql<number>`cast(count(distinct ${orders.id}) as int)`,
      paid: sql<number>`coalesce(sum(${payments.amount}::float8), 0)`,
    })
    .from(orders)
    .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .innerJoin(payments, eq(payments.orderId, orders.id))
    .where(and(inArray(payments.status, [...SETTLED]), eq(mealSizes.custom, false)))
    .groupBy(mealSizes.tier)
    .orderBy(sql`sum(${payments.amount}) desc`);
  return rows.map((r) => ({
    tier: TIER_LABELS[r.tier] ?? r.tier,
    key: r.tier,
    orders: r.orders,
    paid: Math.round(Number(r.paid) * 100) / 100,
  }));
}
