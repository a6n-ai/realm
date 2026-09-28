import { eq, type SQL } from "drizzle-orm";
import { mealSizes } from "@/db/schema";

// Custom meal sizes are per-customer compositions managed under Catalog → Custom
// Meals; the generic Meal Sizes list must never show (or let staff edit) them.
export function catalogListScope(resource: string): SQL | undefined {
  return resource === "meal-sizes" ? eq(mealSizes.custom, false) : undefined;
}
