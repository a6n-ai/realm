"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { setMealTypes } from "@/lib/services/app-settings.service";
import { invalidateCatalogSnapshot } from "@/lib/catalog/load";
import { mealSlotsService } from "@/lib/services/meal-slots.service";
import { menuService } from "@/lib/services/menu.service";
import { ValidationError } from "@tiffin/commons";
import type { MealTypesSettings, PlanType } from "@/lib/menu/meal-types";

const SLOT_KEY_RE = /^[a-z0-9_]+$/;

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

export async function saveSlot(input: {
  id: string | null;
  planType: PlanType;
  key: string;
  label: string;
  enabled: boolean;
  sortOrder: number;
}) {
  await requireAdmin();
  const { id, ...rest } = input;
  if (!SLOT_KEY_RE.test(rest.key)) throw new ValidationError("Slot key must be lowercase letters, numbers, or underscores");
  if (id) await mealSlotsService.update(id, rest);
  else await mealSlotsService.create(rest);
  await bust();
}

export async function deleteSlot(id: string) {
  await requireAdmin();
  await mealSlotsService.delete(id);
  await bust();
}
