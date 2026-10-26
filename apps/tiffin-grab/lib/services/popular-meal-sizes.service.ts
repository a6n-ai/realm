import { and, count, desc, eq, gte, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { mealSizes, orders } from "@/db/schema";

const WINDOW_MS = 90 * 864e5;

/**
 * The meal sizes most ordered in this franchise over the last 90 days (cancelled orders, trials and
 * custom meals left out), most popular first — the plan builder puts these on top.
 */
export async function popularMealSizeIds(orgId: string | null, limit = 2, now = Date.now()): Promise<string[]> {
  const rows = await db
    .select({ publicId: mealSizes.publicId, n: count() })
    .from(orders)
    .innerJoin(mealSizes, eq(mealSizes.id, orders.mealSizeId))
    .where(and(
      ne(orders.status, "cancelled"),
      gte(orders.createdAt, now - WINDOW_MS),
      eq(mealSizes.trial, false),
      eq(mealSizes.custom, false),
      orgId ? eq(orders.organizationId, orgId) : undefined,
    ))
    .groupBy(mealSizes.publicId)
    .orderBy(desc(count()), mealSizes.publicId)
    .limit(limit);
  return rows.map((r) => r.publicId);
}
