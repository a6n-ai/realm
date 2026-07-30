"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { setMealTypes } from "@/lib/services/app-settings.service";
import { invalidateCatalogSnapshot } from "@/lib/catalog/load";
import { menuService } from "@/lib/services/menu.service";
import type { MealTypesSettings } from "@/lib/menu/meal-types";


// Slot edits + theme both feed the cached catalog snapshot AND the published-week
// cache (slots + theme). Evict both so subscribe/ordering and the public poster
// see the change on the next request.
async function bust() {
  await invalidateCatalogSnapshot();
  await menuService.evictPublishedCache();
  revalidatePath("/dashboard/settings");
  revalidatePath("/menu/weekly");
  revalidatePath("/");
}

export async function saveMealTypes(cfg: MealTypesSettings) {
  await requireAdmin();
  await setMealTypes(cfg);
  await bust();
}


