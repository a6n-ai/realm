"use server";

import { revalidatePath } from "next/cache";
import { ValidationError } from "@realm/commons";
import { requireAdmin } from "@/lib/auth/guards";
import { setAppSettings } from "@/lib/services/app-settings.service";

const CURRENCIES = ["INR", "USD", "AED", "GBP", "EUR"] as const;
export const PHONE_COUNTRIES = ["CA", "IN", "US", "AE", "GB"] as const;

export async function saveAppSettings(input: { timezone: string; cutoffHour: number; currency: string; defaultCountry: string | null }) {
  await requireAdmin();
  if (!input.timezone) throw new ValidationError("Timezone is required");
  if (!Number.isInteger(input.cutoffHour) || input.cutoffHour < 0 || input.cutoffHour > 23) {
    throw new ValidationError("Cutoff hour must be an integer 0–23");
  }
  if (!CURRENCIES.includes(input.currency as (typeof CURRENCIES)[number])) {
    throw new ValidationError("Unsupported currency");
  }
  if (input.defaultCountry !== null && !PHONE_COUNTRIES.includes(input.defaultCountry as (typeof PHONE_COUNTRIES)[number])) {
    throw new ValidationError("Unsupported default country");
  }
  await setAppSettings(input as Parameters<typeof setAppSettings>[0]);
  revalidatePath("/dashboard/settings/general");
}
