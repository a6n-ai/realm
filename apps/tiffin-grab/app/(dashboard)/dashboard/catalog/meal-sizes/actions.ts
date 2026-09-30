"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { setTrialSettings } from "@/lib/services/app-settings.service";

export async function saveTrialSettings(input: { maxDays: number | null; weekdays: string[] }): Promise<void> {
  await requireAdmin();
  await setTrialSettings(input);
  revalidatePath("/dashboard/catalog/meal-sizes");
  revalidatePath("/me/trial");
}
