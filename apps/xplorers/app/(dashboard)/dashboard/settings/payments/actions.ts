"use server";

import { revalidatePath } from "next/cache";
import { paymentConfigSchema, type PaymentConfig } from "@foundry/payments";
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

  const seen = new Set<string>();
  for (const m of parsed.data.methods) {
    if (seen.has(m.id)) return { error: `Duplicate payment method: ${m.id}` };
    seen.add(m.id);
    // e-Transfer needs a destination. Cash is collected at the door; other
    // manual rails use free-text instructions.
    if (m.enabled && m.id === "etransfer" && !m.payeeHandle?.trim()) {
      return { error: `${m.label}: add a payee handle before enabling it` };
    }
    for (const t of m.taxes) {
      if (!t.name.trim()) return { error: `${m.label}: a tax line is missing a name` };
    }
  }

  try {
    await setPaymentConfig(parsed.data);
  } catch (e) {
    return actionError(e, "Could not save payment settings");
  }
  revalidatePaymentPaths();
  return {};
}
