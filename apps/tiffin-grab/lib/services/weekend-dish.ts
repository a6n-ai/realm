import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { dishCategories, mealSizeItems } from "@/db/schema";

/** True when the meal size holds a category flagged as a weekend dish; only those can be eaten on Sat/Sun. */
export async function mealSizeServesWeekends(mealSizeId: bigint, q: Pick<typeof db, "select"> = db): Promise<boolean> {
  const [row] = await q.select({ id: mealSizeItems.id }).from(mealSizeItems)
    .innerJoin(dishCategories, eq(dishCategories.key, mealSizeItems.category))
    .where(and(eq(mealSizeItems.mealSizeId, mealSizeId), eq(dishCategories.weekend, true))).limit(1);
  return row != null;
}
