import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, dishCategories, dishes, mealSelections, mealSizes, orderAddons, orders, payments, plans } from "@/db/schema";
import type { SizeSale } from "@/lib/analytics/size-treemap";
import { revenueBy } from "./metrics/money";
import { dateWhere, ordersScope, type AnalyticsScope } from "./metrics/scope";
import { deliveryWhere } from "./operations.service";

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
    .select({ dish: dishes.name, category: sql<string>`min(${dishCategories.label})`, plan: sql<string>`min(${plans.name})`, n: intCount })
    .from(mealSelections)
    .innerJoin(dishes, eq(mealSelections.dishId, dishes.id))
    .innerJoin(dishCategories, eq(mealSelections.categoryId, dishCategories.id))
    .innerJoin(plans, eq(dishes.planId, plans.id))
    .where(selectionOrderIds(scope))
    .groupBy(dishes.name)
    .orderBy(sql`count(*) desc`)
    .limit(limit);
}

export type AddonSale = { name: string; qty: number; amount: number };

/** Orders in range and scope by order date, cancelled orders left out (paid or not: they never ran). */
function liveOrders(scope: AnalyticsScope) {
  return and(ordersScope(scope), dateWhere(orders.createdAt, scope), sql`${orders.status} <> 'cancelled'`);
}

/** Add-on lines sold, by order date; amount is the pre-tax line amount stored on the order. Biggest first. */
export async function getAddonSales(scope: AnalyticsScope): Promise<AddonSale[]> {
  if (noOrgs(scope)) return [];
  const amount = sql<string>`coalesce(sum(${orderAddons.amount}), 0)::text`;
  const rows = await db
    .select({ name: orderAddons.addonName, qty: sql<number>`cast(sum(${orderAddons.qty}) as int)`, amount })
    .from(orderAddons)
    .innerJoin(orders, eq(orderAddons.orderId, orders.id))
    .where(liveOrders(scope))
    .groupBy(orderAddons.addonName)
    .orderBy(sql`sum(${orderAddons.amount}) desc`);
  return rows.map((r) => ({ name: r.name, qty: r.qty, amount: Number(r.amount) }));
}

export type ProductSale = { size: string; weeks: number; orders: number; revenue: number };

/**
 * Orders (order date, cancelled left out) per meal size and duration, with the net revenue of the same
 * size and duration by payment date. The two windows differ, as the card's info says.
 */
export async function getProductSales(scope: AnalyticsScope): Promise<ProductSale[]> {
  if (noOrgs(scope)) return [];
  const [counts, buckets] = await Promise.all([
    db
      .select({ key: mealSizes.key, name: mealSizes.name, weeks: orders.durationWeeks, n: intCount })
      .from(orders)
      .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
      .where(liveOrders(scope))
      .groupBy(mealSizes.key, mealSizes.name, orders.durationWeeks),
    revenueBy(scope, "mealSizeWeeks"),
  ]);
  const net = new Map(buckets.map((b) => [b.key, b.net]));
  return counts
    .map((c) => ({ size: c.name, weeks: c.weeks, orders: c.n, revenue: net.get(`${c.key}|${c.weeks}`) ?? 0 }))
    .sort((a, b) => b.orders - a.orders || b.revenue - a.revenue);
}

const distinctUsers = sql<number>`cast(count(distinct ${orders.userId}) as int)`;

/** Customers who picked dishes on orders in range, against customers with a scheduled delivery in range. */
export async function getPickers(scope: AnalyticsScope) {
  if (noOrgs(scope)) return { pickers: 0, customers: 0 };
  const [[{ n: pickers }], [{ n: customers }]] = await Promise.all([
    db.select({ n: distinctUsers }).from(mealSelections).innerJoin(orders, eq(mealSelections.orderId, orders.id)).where(selectionOrderIds(scope)),
    db
      .select({ n: distinctUsers })
      .from(deliveries)
      .innerJoin(orders, eq(deliveries.orderId, orders.id))
      .where(and(eq(deliveries.status, "scheduled"), deliveryWhere(scope))),
  ]);
  return { pickers, customers };
}

/** Tiffins delivered (scheduled units, by delivery date) per plan and meal size, custom sizes included. */
export async function tiffinsBySize(scope: AnalyticsScope) {
  if (noOrgs(scope)) return [];
  return db
    .select({
      plan: plans.name,
      key: mealSizes.key,
      name: mealSizes.name,
      custom: mealSizes.custom,
      tiffins: sql<number>`cast(coalesce(sum(${deliveries.tiffinUnits}), 0) as int)`,
    })
    .from(deliveries)
    .innerJoin(orders, eq(deliveries.orderId, orders.id))
    .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .innerJoin(plans, eq(mealSizes.planId, plans.id))
    .where(and(eq(deliveries.status, "scheduled"), deliveryWhere(scope)))
    .groupBy(plans.name, mealSizes.key, mealSizes.name, mealSizes.custom);
}

/**
 * Net revenue (payment date) and tiffins (delivery date) per meal size, custom sizes included, so the revenue column
 * sums to the Revenue tab's net. A size with money but no deliveries in range (or the reverse) still gets a row.
 */
export async function getSizeSales(scope: AnalyticsScope): Promise<SizeSale[]> {
  const [buckets, tiffins, sizes] = await Promise.all([
    revenueBy(scope, "mealSize"),
    tiffinsBySize(scope),
    db
      .select({ key: mealSizes.key, name: mealSizes.name, custom: mealSizes.custom, plan: plans.name })
      .from(mealSizes)
      .innerJoin(plans, eq(mealSizes.planId, plans.id)),
  ]);
  const byKey = new Map(sizes.map((s) => [s.key, s]));
  const out = new Map<string, SizeSale>();
  const row = (key: string) => {
    const s = byKey.get(key);
    const existing = out.get(key);
    if (existing) return existing;
    const made = { plan: s?.plan ?? "Other", size: s?.name ?? "Unknown size", custom: s?.custom ?? false, revenue: 0, tiffins: 0 };
    out.set(key, made);
    return made;
  };
  for (const b of buckets) row(b.key).revenue += b.net;
  for (const t of tiffins) row(t.key).tiffins += t.tiffins;
  return [...out.values()];
}

// "Paid by ..." is Revenue's definition (net ex tax and surcharge, after refunds, by capture date),
// so each split sums to the Revenue tab's net. `payments` counts captured payments, not orders.

const TIER_LABELS: Record<string, string> = { budget: "Budget", medium: "Medium", premium: "Premium", custom: "Custom" };

export type PaidTierRow = { tier: string; key: string; payments: number; paid: number };

export type PaidMealTypeRow = {
  mealType: string;
  key: string;
  plan: string;
  payments: number;
  paid: number;
};

/**
 * Every revenue bucket, so each split sums to the Revenue tab's net. Custom sizes (and money on a size no longer
 * in the catalog) have no tier; they fall under tier "custom".
 */
async function paidByMealSize(scope: AnalyticsScope) {
  const [buckets, sizes] = await Promise.all([
    revenueBy(scope, "mealSize"),
    db
      .select({ key: mealSizes.key, name: mealSizes.name, tier: mealSizes.tier, custom: mealSizes.custom, plan: plans.name })
      .from(mealSizes)
      .innerJoin(plans, eq(mealSizes.planId, plans.id)),
  ]);
  const byKey = new Map(sizes.map((s) => [s.key, s]));
  return buckets.map((b) => {
    const s = byKey.get(b.key);
    const size = { key: b.key, name: s?.name ?? "Unknown size", plan: s?.plan ?? "Other", tier: s && !s.custom ? s.tier : "custom" };
    return { size, bucket: b };
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

const TIER_ORDER = ["budget", "medium", "premium", "custom"];

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
