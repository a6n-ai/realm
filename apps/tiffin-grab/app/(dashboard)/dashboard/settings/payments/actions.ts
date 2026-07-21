"use server";

import { revalidatePath } from "next/cache";
import { ValidationError } from "@realm/commons";
import { paymentConfigSchema, type PaymentConfig } from "@realm/payments";
import { requireAdmin } from "@/lib/auth/guards";
import { setPaymentConfig } from "@/lib/services/app-settings.service";

// Saves the whole payment config in one shot (the blob is small). Beyond the schema shape,
// enforce app-level rules the shared schema can't know: unique method ids and a payee handle
// on any enabled manual method (otherwise customers get instructions with no destination).
export async function savePaymentConfig(cfg: PaymentConfig) {
  await requireAdmin();

  const parsed = paymentConfigSchema.safeParse(cfg);
  if (!parsed.success) throw new ValidationError("Invalid payment configuration");

  const seen = new Set<string>();
  for (const m of parsed.data.methods) {
    if (seen.has(m.id)) throw new ValidationError(`Duplicate payment method: ${m.id}`);
    seen.add(m.id);
    if (m.enabled && m.kind === "manual" && !m.payeeHandle?.trim()) {
      throw new ValidationError(`${m.label}: add a payee handle before enabling it`);
    }
    for (const t of m.taxes) {
      if (!t.name.trim()) throw new ValidationError(`${m.label}: a tax line is missing a name`);
    }
  }

  await setPaymentConfig(parsed.data);
  revalidatePath("/dashboard/settings/payments");
}
