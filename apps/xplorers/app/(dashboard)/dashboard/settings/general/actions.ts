"use server";

import { revalidatePath } from "next/cache";
import { ValidationError } from "@foundry/commons";
import { requireAdmin } from "@/lib/auth/guards";
import { CURRENCIES, isIanaTimeZone } from "@/lib/app-clock";
import { setAppClock } from "@/lib/services/app-settings.service";

export async function saveAppClock(input: { timezone: string; currency: string }) {
  await requireAdmin();
  if (!isIanaTimeZone(input.timezone)) throw new ValidationError("Pick a valid timezone.");
  if (!CURRENCIES.includes(input.currency as (typeof CURRENCIES)[number])) {
    throw new ValidationError("Unsupported currency.");
  }
  await setAppClock(input);
  revalidatePath("/dashboard/settings/general");
}
