"use server";

import { revalidatePath } from "next/cache";
import { ValidationError } from "@foundry/commons";
import { requireAdmin } from "@/lib/auth/guards";
import { invalidateCatalogSnapshot } from "@/lib/catalog/load";
import { getAppSettings, setAppSettings } from "@/lib/services/app-settings.service";

export async function saveDiscountCap(input: { maxDiscountPct: number }) {
  await requireAdmin();
  const v = input.maxDiscountPct;
  if (!Number.isInteger(v) || v < 0 || v > 100) throw new ValidationError("Discount cap must be a whole number from 0 to 100");
  const { timezone, cutoffHour } = await getAppSettings();
  await setAppSettings({ timezone, cutoffHour, maxDiscountPct: v });
  await invalidateCatalogSnapshot();
  revalidatePath("/dashboard/catalog/discounts");
  revalidatePath("/subscribe");
}
