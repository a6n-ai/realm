"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { setMealTypes } from "@/lib/services/app-settings.service";
import { invalidateCatalogSnapshot } from "@/lib/catalog/load";
import type { MealTypesSettings } from "@/lib/menu/meal-types";

export async function saveMealTypes(cfg: MealTypesSettings) {
  await requireAdmin();
  await setMealTypes(cfg);
  // Catalog snapshot derives plan offeredSlots from meal-types; bust its
  // separate cache so subscribe/order paths don't serve stale slots.
  await invalidateCatalogSnapshot();
  revalidatePath("/dashboard/settings");
  revalidatePath("/menu/weekly");
  revalidatePath("/");
}
