import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { mealSizeItems } from "@/db/schema";

/** One composition row of a meal size, numeric and in the order the box is packed (sortOrder). */
export type MealSizeItem = {
  mealSizeId: bigint;
  category: string;
  tuAmount: number;
  maxTuAmount: number | null;
  sortOrder: number;
  planId: bigint;
  role: (typeof mealSizeItems.$inferSelect)["role"];
};

export async function loadMealSizeItems(mealSizeIds: bigint | bigint[]): Promise<MealSizeItem[]> {
  const ids = Array.isArray(mealSizeIds) ? mealSizeIds : [mealSizeIds];
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      mealSizeId: mealSizeItems.mealSizeId,
      category: mealSizeItems.category,
      tuAmount: mealSizeItems.tuAmount,
      maxTuAmount: mealSizeItems.maxTuAmount,
      sortOrder: mealSizeItems.sortOrder,
      planId: mealSizeItems.planId,
      role: mealSizeItems.role,
    })
    .from(mealSizeItems)
    .where(ids.length === 1 ? eq(mealSizeItems.mealSizeId, ids[0]!) : inArray(mealSizeItems.mealSizeId, ids))
    .orderBy(asc(mealSizeItems.sortOrder));
  return rows.map((r) => ({ ...r, tuAmount: Number(r.tuAmount), maxTuAmount: r.maxTuAmount == null ? null : Number(r.maxTuAmount) }));
}

/** TU per row, by category, in pack order: the first is the category's pick TU. */
export function tuSlotsByCategory(items: { category: string; tuAmount: number }[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const i of items) out.set(i.category, [...(out.get(i.category) ?? []), i.tuAmount]);
  return out;
}
