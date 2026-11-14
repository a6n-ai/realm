"use server";

import { ValidationError } from "@foundry/commons";
import type { ActionResult } from "@/lib/actions/action-result";
import { staffAction } from "@/lib/actions/staff-action";
import { getAppSettings } from "@/lib/settings";
import { setAppSettings } from "@/lib/deliveries/set-app-settings";

export async function saveTiffinsPerWeek(input: { minTiffinsPerWeek: number; maxTiffinsPerWeek: number }): Promise<ActionResult> {
  return staffAction({ guard: "admin", revalidate: ["/dashboard/catalog/delivery-frequencies", "/subscribe"], catalog: true }, async () => {
    const { minTiffinsPerWeek: min, maxTiffinsPerWeek: max } = input;
    for (const [label, v] of [["Min", min], ["Max", max]] as const) {
      if (!Number.isInteger(v) || v < 1 || v > 7) throw new ValidationError(`${label} tiffins per week must be a whole number from 1 to 7`);
    }
    if (min > max) throw new ValidationError("Min tiffins per week cannot exceed max");
    // setAppSettings requires timezone/cutoffHour; echo current values so they stay unchanged.
    const { timezone, cutoffHour } = await getAppSettings();
    await setAppSettings({ timezone, cutoffHour, minTiffinsPerWeek: min, maxTiffinsPerWeek: max });
  });
}
