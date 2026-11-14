"use server";

import { staffAction } from "@/lib/actions/staff-action";
import type { ActionResult } from "@/lib/actions/action-result";
import { setMealTypes } from "@/lib/services/app-settings.service";
import { menuService } from "@/lib/menu/menu.service";
import type { MealTypesSettings } from "@/lib/menu/meal-types";

// Slot edits + theme feed the catalog snapshot (catalog: true) AND the published-week cache;
// evict both so subscribe/ordering and the public poster see the change on the next request.
export async function saveMealTypes(cfg: MealTypesSettings): Promise<ActionResult> {
  return staffAction({ guard: "admin", revalidate: ["/dashboard/settings"], catalog: true }, async () => {
    await setMealTypes(cfg);
    await menuService.evictPublishedCache();
  });
}
