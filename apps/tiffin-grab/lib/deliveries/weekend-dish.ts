import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { dishCategories, mealSizeItems, mealSizes } from "@/db/schema";
import type { DayOfWeek } from "@/lib/menu/delivery-days";

/** True when the meal size holds a category flagged as a weekend dish; only those can be eaten on Sat/Sun. */
export async function mealSizeServesWeekends(mealSizeId: bigint, q: Pick<typeof db, "select"> = db): Promise<boolean> {
  const [row] = await q.select({ id: mealSizeItems.id }).from(mealSizeItems)
    .innerJoin(dishCategories, eq(dishCategories.key, mealSizeItems.category))
    .where(and(eq(mealSizeItems.mealSizeId, mealSizeId), eq(dishCategories.weekend, true))).limit(1);
  return row != null;
}

/** The meal size's allowed days (Catalog → Meal sizes); null when it has none, i.e. every day. */
export async function mealSizeAllowedDays(mealSizeId: bigint, q: Pick<typeof db, "select"> = db): Promise<DayOfWeek[] | null> {
  const [row] = await q.select({ days: mealSizes.allowedDays }).from(mealSizes).where(eq(mealSizes.id, mealSizeId)).limit(1);
  return row?.days?.length ? (row.days as DayOfWeek[]) : null;
}
