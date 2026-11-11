import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { mealSizes } from "@/db/schema";
import { mealCostFloor } from "@/lib/pricing/cost-floor";

/** Kitchen cost floor for a meal size × this plan's tiffin count. Null when cost is unset. */
export async function loadMealCostFloor(mealSizePublicId: string, tiffinCount: number): Promise<number | null> {
  const [row] = await db
    .select({ costPrice: mealSizes.costPrice })
    .from(mealSizes)
    .where(eq(mealSizes.publicId, mealSizePublicId))
    .limit(1);
  if (row?.costPrice == null) return null;
  return mealCostFloor(Number(row.costPrice), tiffinCount);
}
