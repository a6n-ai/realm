"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { setReferralSettings } from "@/lib/services/app-settings.service";

// Validated again in the service; this is the admin gate.
export async function setReferralSettingsAction(input: unknown): Promise<void> {
  await requireAdmin();
  await setReferralSettings(input);
  revalidatePath("/dashboard/wallet/referrals");
}
