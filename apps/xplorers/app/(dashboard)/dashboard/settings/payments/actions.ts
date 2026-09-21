"use server";

import { revalidatePath } from "next/cache";
import { paymentConfigSaveError, paymentConfigSchema, type PaymentConfig } from "@foundry/payments";
import { requireAdmin } from "@/lib/auth/guards";
import { setPaymentConfig } from "@/lib/services/app-settings.service";

function actionError(e: unknown, fallback: string): { error: string } {
  return { error: e instanceof Error ? e.message : fallback };
}

function revalidatePaymentPaths() {
  revalidatePath("/dashboard/settings/payments", "layout");
  revalidatePath("/dashboard/settings/integrations");
  revalidatePath("/dashboard/settings");
}

export async function savePaymentConfig(cfg: PaymentConfig): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = paymentConfigSchema.safeParse(cfg);
  if (!parsed.success) return { error: "Invalid payment configuration" };

  const error = paymentConfigSaveError(parsed.data);
  if (error) return { error };

  try {
    await setPaymentConfig(parsed.data);
  } catch (e) {
    return actionError(e, "Could not save payment settings");
  }
  revalidatePaymentPaths();
  return {};
}
