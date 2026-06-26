"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { setMealTypes } from "@/lib/services/app-settings.service";
import { invalidateCatalogSnapshot } from "@/lib/catalog/load";
import { mealSlotsService } from "@/lib/services/meal-slots.service";
import type { MealTypesSettings, PlanType } from "@/lib/menu/meal-types";

function bust() {
  revalidatePath("/dashboard/settings");
  revalidatePath("/menu/weekly");
  revalidatePath("/");
}

export async function saveMealTypes(cfg: MealTypesSettings) {
  await requireAdmin();
  await setMealTypes(cfg);
  await invalidateCatalogSnapshot();
  bust();
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
  if (id) {
    await mealSlotsService.update(id, { planType: rest.planType, key: rest.key, label: rest.label, enabled: rest.enabled, sortOrder: rest.sortOrder });
  } else {
    await mealSlotsService.create({ planType: rest.planType, key: rest.key, label: rest.label, enabled: rest.enabled, sortOrder: rest.sortOrder });
  }
  await invalidateCatalogSnapshot();
  bust();
}

export async function deleteSlot(id: string) {
  await requireAdmin();
  await mealSlotsService.delete(id);
  await invalidateCatalogSnapshot();
  bust();
}
