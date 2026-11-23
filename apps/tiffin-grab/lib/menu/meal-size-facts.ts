import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { dishCategories, mealSizeItems, mealSizes } from "@/db/schema";
import { configCache } from "@/lib/cache";
import type { DayOfWeek } from "@/lib/deliveries/schedule/delivery-days";

export type MealSizeFacts = {
  planId: bigint;
  custom: boolean;
  allowedDays: DayOfWeek[] | null;
  servesWeekends: boolean;
};

// Display-path lookups per meal size. Every meal size, meal size item or dish category write evicts it.
const factsCache = configCache("meal-size-facts");

export async function invalidateMealSizeFacts(): Promise<void> {
  await factsCache.evictAll();
}

/** Null for an unknown meal size. TieredCache never stores null, so a size created later is seen at once. */
export function mealSizeFacts(id: bigint): Promise<MealSizeFacts | null> {
  return factsCache.getOrSet(String(id), async () => {
    const [size] = await db
      .select({ planId: mealSizes.planId, custom: mealSizes.custom, days: mealSizes.allowedDays })
      .from(mealSizes)
      .where(eq(mealSizes.id, id))
      .limit(1);
    if (!size) return null;
    const [weekend] = await db
      .select({ id: mealSizeItems.id })
      .from(mealSizeItems)
      .innerJoin(dishCategories, eq(dishCategories.key, mealSizeItems.category))
      .where(and(eq(mealSizeItems.mealSizeId, id), eq(dishCategories.weekend, true)))
      .limit(1);
    return {
      planId: size.planId,
      custom: size.custom,
      allowedDays: size.days?.length ? (size.days as DayOfWeek[]) : null,
      servesWeekends: weekend != null,
    };
  });
}
