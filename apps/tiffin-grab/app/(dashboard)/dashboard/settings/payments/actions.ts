"use server";

import { ValidationError } from "@foundry/commons";
import { paymentConfigSaveError, paymentConfigSchema, type PaymentConfig } from "@foundry/payments";
import { findPaymentProvider } from "@foundry/payments/providers";
import type { ActionResult } from "@/lib/actions/action-result";
import { staffAction } from "@/lib/actions/staff-action";
import { getPaymentConfig, setPaymentConfig } from "@/lib/services/app-settings.service";

const OPTS = { guard: "admin", revalidate: [["/dashboard/settings/payments", "layout"], "/dashboard/settings/integrations"] } as const;

// Shared Foundry rules: payee handle only for enabled e-Transfer; cash needs no destination.
export async function savePaymentConfig(cfg: PaymentConfig): Promise<ActionResult> {
  return staffAction(OPTS, async () => {
    const parsed = paymentConfigSchema.safeParse(cfg);
    if (!parsed.success) throw new ValidationError("Invalid payment configuration");

    const error = paymentConfigSaveError(parsed.data);
    if (error) throw new ValidationError(error);

    await setPaymentConfig(parsed.data);
  });
}

/** Install a catalog payment plugin (adds its method stub to payment_config). */
export async function installPaymentPlugin(pluginId: string): Promise<ActionResult> {
  return staffAction(OPTS, async () => {
    const plugin = findPaymentProvider(pluginId);
    if (!plugin) throw new ValidationError("Unknown payment plugin");

    const cfg = await getPaymentConfig();
    if (cfg.methods.some((m) => m.id === plugin.id)) {
      throw new ValidationError(`${plugin.label} is already installed`);
    }
    await setPaymentConfig({ ...cfg, methods: [...cfg.methods, plugin.seed()] });
  });
}
