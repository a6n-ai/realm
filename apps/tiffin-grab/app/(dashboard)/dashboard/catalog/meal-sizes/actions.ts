"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { setTrialSettings } from "@/lib/services/trial-settings.service";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";
import { runAction } from "@/app/(customer)/me/action-result";

export async function saveTrialSettings(input: { frequencyKey: string | null; maxDays: number | null }) {
  return runAction(async () => {
    await requireAdmin();
    await setTrialSettings(input, await resolveRequestOrg());
    revalidatePath("/dashboard/catalog/meal-sizes");
  });
}
