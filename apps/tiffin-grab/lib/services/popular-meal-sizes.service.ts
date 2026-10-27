import { and, count, desc, eq, gte, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { mealSizes, orders, plans } from "@/db/schema";
import { sharedCache } from "@/lib/cache";

const WINDOW_MS = 90 * 864e5;
// Rankings move over days, not minutes: an hour per franchise keeps the two count queries off every page view.
const popularCache = sharedCache("popular-meal-sizes", 60 * 60_000);

/** Meal size ids per plan key, most ordered first (cancelled orders, trials and custom meals left out). */
async function ranked(orgId: string | null, since: number | null): Promise<Record<string, string[]>> {
  const rows = await db
    .select({ planKey: plans.key, publicId: mealSizes.publicId, n: count() })
    .from(orders)
    .innerJoin(mealSizes, eq(mealSizes.id, orders.mealSizeId))
    .innerJoin(plans, eq(plans.id, orders.planId))
    .where(and(
      ne(orders.status, "cancelled"),
      since == null ? undefined : gte(orders.createdAt, since),
      eq(mealSizes.trial, false),
      eq(mealSizes.custom, false),
      orgId ? eq(orders.organizationId, orgId) : undefined,
    ))
    .groupBy(plans.key, mealSizes.publicId)
    .orderBy(desc(count()), mealSizes.publicId);
  const out: Record<string, string[]> = {};
  for (const r of rows) (out[r.planKey] ??= []).push(r.publicId);
  return out;
}

/**
 * The plan builder's "Most popular" row: per plan, the meal sizes most ordered in this franchise over the
 * last 90 days, topped up from all-time orders when 90 days has fewer than `limit`. The Bundle step fills
 * any remaining gap from the catalog, so a plan always shows `limit` cards.
 */
export function popularMealSizesByPlan(orgId: string | null, limit = 2): Promise<Record<string, string[]>> {
  return popularCache.getOrSet(`by-plan:${orgId ?? "global"}:${limit}`, () => rankByPlan(orgId, limit, Date.now()));
}

async function rankByPlan(orgId: string | null, limit: number, now: number): Promise<Record<string, string[]>> {
  const [recent, ever] = await Promise.all([ranked(orgId, now - WINDOW_MS), ranked(orgId, null)]);
  const out: Record<string, string[]> = {};
  for (const key of new Set([...Object.keys(recent), ...Object.keys(ever)])) {
    out[key] = [...new Set([...(recent[key] ?? []), ...(ever[key] ?? [])])].slice(0, limit);
  }
  return out;
}
