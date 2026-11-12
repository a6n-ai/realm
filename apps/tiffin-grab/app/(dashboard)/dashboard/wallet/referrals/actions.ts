"use server";

import type { ActionResult } from "@/lib/actions/action-result";
import { staffAction } from "@/lib/actions/staff-action";
import { setReferralSettings } from "@/lib/services/app-settings.service";

// Validated again in the service; this is the admin gate.
export async function setReferralSettingsAction(input: unknown): Promise<ActionResult> {
  return staffAction({ guard: "admin", revalidate: ["/dashboard/wallet/referrals"] }, async () => {
    await setReferralSettings(input);
  });
}
