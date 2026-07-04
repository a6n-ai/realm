"use server";

import { revalidatePath } from "next/cache";
import { ValidationError } from "@realm/commons";
import { requireAdmin } from "@/lib/auth/guards";
import { setAppSettings } from "@/lib/services/app-settings.service";

export async function saveAppSettings(input: { timezone: string; cutoffHour: number }) {
  await requireAdmin();
  if (!input.timezone) throw new ValidationError("Timezone is required");
  if (!Number.isInteger(input.cutoffHour) || input.cutoffHour < 0 || input.cutoffHour > 23) {
    throw new ValidationError("Cutoff hour must be an integer 0–23");
  }
  await setAppSettings(input);
  revalidatePath("/dashboard/settings/general");
}
