import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, mealSelections, menuWeeks, orders } from "@/db/schema";
import { sharedCache } from "@/lib/cache";

// Same shape as menuService.dishPickCounts, narrowed to orders delivered in one zone. Picks move
// weekly, so an hour is plenty; the area page itself revalidates hourly too.
const zonePickCache = sharedCache("zone-pick-counts", 60 * 60 * 1000);

/** Picks per stored dish name since a week start, for orders in one delivery zone. */
export function zonePickCounts(zoneId: bigint, sinceWeekStart: string): Promise<Record<string, number>> {
  return zonePickCache.getOrSet(`${zoneId}:${sinceWeekStart}`, async () => {
    const rows = await db
      .select({ name: dishes.name, picks: sql<number>`count(*)` })
      .from(mealSelections)
      .innerJoin(orders, eq(orders.id, mealSelections.orderId))
      .innerJoin(dishes, eq(dishes.id, mealSelections.dishId))
      .innerJoin(menuWeeks, eq(menuWeeks.id, mealSelections.menuWeekId))
      .where(and(eq(orders.zoneId, zoneId), gte(menuWeeks.weekStart, sinceWeekStart)))
      .groupBy(dishes.name);
    return Object.fromEntries(rows.map((r) => [r.name, Number(r.picks)]));
  });
}
