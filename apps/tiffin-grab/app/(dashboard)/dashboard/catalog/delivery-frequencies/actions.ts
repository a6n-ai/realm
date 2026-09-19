"use server";

import { revalidatePath } from "next/cache";
import { ValidationError } from "@foundry/commons";
import { requireAdmin } from "@/lib/auth/guards";
import { getAppSettings, setAppSettings } from "@/lib/services/app-settings.service";

export async function saveTiffinsPerWeek(input: { minTiffinsPerWeek: number; maxTiffinsPerWeek: number }) {
  await requireAdmin();
  const { minTiffinsPerWeek: min, maxTiffinsPerWeek: max } = input;
  for (const [label, v] of [["Min", min], ["Max", max]] as const) {
    if (!Number.isInteger(v) || v < 1 || v > 7) throw new ValidationError(`${label} tiffins per week must be a whole number from 1 to 7`);
  }
  if (min > max) throw new ValidationError("Min tiffins per week cannot exceed max");
  // setAppSettings requires timezone/cutoffHour; echo current values so they stay unchanged.
  const { timezone, cutoffHour } = await getAppSettings();
  await setAppSettings({ timezone, cutoffHour, minTiffinsPerWeek: min, maxTiffinsPerWeek: max });
  revalidatePath("/dashboard/catalog/delivery-frequencies");
  revalidatePath("/subscribe");
}
