import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, mealSelections, mealSizes, orders, payments, plans } from "@/db/schema";
import { revenueBy } from "./metrics/money";
import { dateWhere, ordersScope, type AnalyticsScope } from "./metrics/scope";

const intCount = sql<number>`cast(count(*) as int)`;

const noOrgs = (scope: AnalyticsScope) => scope.orgIds !== "all" && scope.orgIds.length === 0;

export type ProductStats = {
  totalSelections: number;
  distinctDishes: number;
  /** Orders in scope that have at least one meal selection. */
  ordersWithPicks: number;
  topDish: string | null;
};

/** Orders created in range and scope, minus cancelled orders nobody paid for (they never ran). */
function selectionOrderIds(scope: AnalyticsScope) {
  return sql`${mealSelections.orderId} in (
    select ${orders.id} from ${orders}
    where ${and(
      ordersScope(scope),
      dateWhere(orders.createdAt, { fromMs: scope.fromMs, toMs: scope.toMs }),
      sql`not (${orders.status} = 'cancelled' and not exists (
        select 1 from ${payments} where ${payments.orderId} = ${orders.id} and ${payments.status} in ('paid', 'simulated_paid')
      ))`,
    )}
  )`;
}

export async function getProductStats(scope: AnalyticsScope): Promise<ProductStats> {
  if (noOrgs(scope)) return { totalSelections: 0, distinctDishes: 0, ordersWithPicks: 0, topDish: null };
  const selectionWhere = selectionOrderIds(scope);
  const [[{ n: totalSelections }], [{ n: distinctDishes }], [{ n: ordersWithPicks }], top] = await Promise.all([
    db.select({ n: intCount }).from(mealSelections).where(selectionWhere),
    db
      .select({ n: sql<number>`cast(count(distinct ${mealSelections.dishId}) as int)` })
      .from(mealSelections)
      .where(selectionWhere),
    db
      .select({ n: sql<number>`cast(count(distinct ${mealSelections.orderId}) as int)` })
      .from(mealSelections)
      .where(selectionWhere),
    db
      .select({ name: dishes.name, n: intCount })
      .from(mealSelections)
      .innerJoin(dishes, eq(mealSelections.dishId, dishes.id))
      .where(selectionWhere)
      .groupBy(dishes.name)
      .orderBy(sql`count(*) desc`)
      .limit(1),
  ]);
  return { totalSelections, distinctDishes, ordersWithPicks, topDish: top[0]?.name ?? null };
}

export async function getTopDishes(limit = 8, scope: AnalyticsScope) {
  if (noOrgs(scope)) return [];
  return db
    .select({ dish: dishes.name, n: intCount })
    .from(mealSelections)
    .innerJoin(dishes, eq(mealSelections.dishId, dishes.id))
    .where(selectionOrderIds(scope))
    .groupBy(dishes.name)
    .orderBy(sql`count(*) desc`)
    .limit(limit);
}

// "Paid by ..." is Revenue's definition (net ex tax and surcharge, after refunds, by capture date),
// so each split sums to the Revenue tab's net. `payments` counts captured payments, not orders.

const TIER_LABELS: Record<string, string> = { budget: "Budget", medium: "Medium", premium: "Premium" };

export type PaidTierRow = { tier: string; key: string; payments: number; paid: number };

export type PaidMealTypeRow = {
  mealType: string;
  key: string;
  plan: string;
  payments: number;
  paid: number;
};

/** Catalog meal sizes only; custom sizes stay out of both splits, as the card subtitles say. */
async function paidByMealSize(scope: AnalyticsScope) {
  const [buckets, sizes] = await Promise.all([
    revenueBy(scope, "mealSize"),
    db
      .select({ key: mealSizes.key, name: mealSizes.name, tier: mealSizes.tier, plan: plans.name })
      .from(mealSizes)
      .innerJoin(plans, eq(mealSizes.planId, plans.id))
      .where(eq(mealSizes.custom, false)),
  ]);
  const byKey = new Map(sizes.map((s) => [s.key, s]));
  return buckets.flatMap((b) => {
    const size = byKey.get(b.key);
    return size ? [{ size, bucket: b }] : [];
  });
}

export async function getPaidByTier(scope: AnalyticsScope): Promise<PaidTierRow[]> {
  const byTier = new Map<string, PaidTierRow>();
  for (const { size, bucket } of await paidByMealSize(scope)) {
    const row = byTier.get(size.tier) ?? { tier: TIER_LABELS[size.tier] ?? size.tier, key: size.tier, payments: 0, paid: 0 };
    row.payments += bucket.payments;
    row.paid = Math.round((row.paid + bucket.net) * 100) / 100;
    byTier.set(size.tier, row);
  }
  return [...byTier.values()].sort((a, b) => b.paid - a.paid);
}

export type PaidTierDietRow = { tier: string; tierKey: string; diet: string; paid: number };

/** Meal tier x diet. A meal size belongs to one plan (the diet), so this is the same buckets as getPaidByTier, split by plan. */
export async function getPaidByTierAndDiet(scope: AnalyticsScope): Promise<PaidTierDietRow[]> {
  const cells = new Map<string, PaidTierDietRow>();
  for (const { size, bucket } of await paidByMealSize(scope)) {
    const id = `${size.tier}|${size.plan}`;
    const cell = cells.get(id) ?? { tier: TIER_LABELS[size.tier] ?? size.tier, tierKey: size.tier, diet: size.plan, paid: 0 };
    cell.paid = Math.round((cell.paid + bucket.net) * 100) / 100;
    cells.set(id, cell);
  }
  return [...cells.values()];
}

const TIER_ORDER = ["budget", "medium", "premium"];

/** Fixed order so a diet keeps its colour across ranges: veg, non-veg, healthy, then the rest A-Z. */
export function dietOrder(a: string, b: string) {
  const rank = (d: string) => {
    const k = d.toLowerCase();
    return /non/.test(k) ? 1 : /veg/.test(k) ? 0 : /health/.test(k) ? 2 : 3;
  };
  return rank(a) - rank(b) || a.localeCompare(b);
}

export function tierOrder(a: string, b: string) {
  const rank = (k: string) => {
    const i = TIER_ORDER.indexOf(k);
    return i < 0 ? TIER_ORDER.length : i;
  };
  return rank(a) - rank(b);
}

/** Paid money grouped by catalog meal size (Maharaja Thali, 4 Item Thali, ...). */
export async function getPaidByMealType(scope: AnalyticsScope): Promise<PaidMealTypeRow[]> {
  return (await paidByMealSize(scope))
    .map(({ size, bucket }) => ({ mealType: size.name, key: size.key, plan: size.plan, payments: bucket.payments, paid: bucket.net }))
    .sort((a, b) => b.paid - a.paid);
}
