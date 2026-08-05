import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, mealSelections, mealSizes, orders, plans } from "@/db/schema";

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

export async function getOrdersByPlan() {
  return db
    .select({ plan: plans.name, n: intCount })
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .groupBy(plans.name)
    .orderBy(sql`count(*) desc`);
}

const TIER_LABELS: Record<string, string> = { budget: "Budget", medium: "Medium", premium: "Premium" };

export async function getOrdersByTier() {
  const rows = await db
    .select({ tier: mealSizes.tier, n: intCount })
    .from(orders)
    .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .groupBy(mealSizes.tier);
  return rows.map((r) => ({ tier: TIER_LABELS[r.tier] ?? r.tier, n: r.n }));
}
