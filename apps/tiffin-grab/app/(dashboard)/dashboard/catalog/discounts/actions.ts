"use server";

import { ValidationError } from "@foundry/commons";
import type { ActionResult } from "@/lib/actions/action-result";
import { staffAction } from "@/lib/actions/staff-action";
import { getAppSettings, setAppSettings } from "@/lib/services/app-settings.service";

export async function saveDiscountCap(input: { maxDiscountPct: number }): Promise<ActionResult> {
  return staffAction({ guard: "admin", revalidate: ["/dashboard/catalog/discounts", "/subscribe"], catalog: true }, async () => {
    const v = input.maxDiscountPct;
    if (!Number.isInteger(v) || v < 0 || v > 100) throw new ValidationError("Discount cap must be a whole number from 0 to 100");
    const { timezone, cutoffHour } = await getAppSettings();
    await setAppSettings({ timezone, cutoffHour, maxDiscountPct: v });
  });
}
