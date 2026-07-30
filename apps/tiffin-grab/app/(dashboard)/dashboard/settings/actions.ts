"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { setMealTypes } from "@/lib/services/app-settings.service";
import { invalidateCatalogSnapshot } from "@/lib/catalog/load";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { menuService } from "@/lib/services/menu.service";
import { ValidationError } from "@realm/commons";
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
  // Plans this slot belongs to. Replaces planType: a slot is now shared by the
  // plans an admin attaches it to, so "salad" is one row on several plans rather
  // than a duplicate per plan type.
  planPublicIds: string[];
  key: string;
  label: string;
  enabled: boolean;
  selectable: boolean;
  sortOrder: number;
}) {
  await requireAdmin();
  const { id, planPublicIds, ...rest } = input;
  if (!SLOT_KEY_RE.test(rest.key)) throw new ValidationError("Slot key must be lowercase letters, numbers, or underscores");
  if (planPublicIds.length === 0) throw new ValidationError("Pick at least one plan — a slot on no plan never appears on a menu");
  const row = id
    ? await dishCategoriesService.update(id, rest)
    : await dishCategoriesService.create(rest);
  await dishCategoriesService.setPlans(row.publicId, planPublicIds);
  await bust();
}

export async function deleteSlot(id: string) {
  await requireAdmin();
  await dishCategoriesService.delete(id);
  await bust();
}
