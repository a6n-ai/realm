"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { mealSlotsService } from "@/lib/services/meal-slots.service";

export async function setSlotEnabled(id: string, enabled: boolean) {
  await requireAdmin();
  await mealSlotsService.update(id, { enabled });
  revalidatePath("/dashboard/settings/meal-slots");
}
