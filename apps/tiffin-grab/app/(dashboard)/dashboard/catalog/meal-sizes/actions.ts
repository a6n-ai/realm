"use server";

import type { ActionResult } from "@/lib/actions/action-result";
import { staffAction } from "@/lib/actions/staff-action";
import { setTrialSettings } from "@/lib/services/trial-settings.service";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";

export async function saveTrialSettings(input: { frequencyKey: string | null; maxDays: number | null }): Promise<ActionResult> {
  return staffAction({ guard: "admin", revalidate: ["/dashboard/catalog/meal-sizes"] }, async () => {
    await setTrialSettings(input, await resolveRequestOrg());
  });
}
