"use server";

import { revalidatePath } from "next/cache";
import { ValidationError } from "@foundry/commons";
import { paymentConfigSaveError, paymentConfigSchema, type PaymentConfig } from "@foundry/payments";
import { findPaymentProvider } from "@foundry/payments/providers";
import { requireAdmin } from "@/lib/auth/guards";
import { runAction, type ActionResult } from "@/app/(customer)/me/action-result";
import { getPaymentConfig, setPaymentConfig } from "@/lib/services/app-settings.service";

function revalidatePaymentPaths() {
  revalidatePath("/dashboard/settings/payments", "layout");
  revalidatePath("/dashboard/settings/integrations");
}

// Expected failures are RETURNED (runAction): thrown errors are redacted to
// "Minified React error #441" in prod. Shared Foundry rules: payee handle only
// for enabled e-Transfer; cash needs no destination.
export async function savePaymentConfig(cfg: PaymentConfig): Promise<ActionResult> {
  return runAction(async () => {
    await requireAdmin();
    await savePaymentConfigUnsafe(cfg);
  });
}

async function savePaymentConfigUnsafe(cfg: PaymentConfig) {
  const parsed = paymentConfigSchema.safeParse(cfg);
  if (!parsed.success) throw new ValidationError("Invalid payment configuration");

  const error = paymentConfigSaveError(parsed.data);
  if (error) throw new ValidationError(error);

  await setPaymentConfig(parsed.data);
  revalidatePaymentPaths();
}

/** Install a catalog payment plugin (adds its method stub to payment_config). */
export async function installPaymentPlugin(pluginId: string): Promise<ActionResult> {
  return runAction(async () => {
    await requireAdmin();
    await installPaymentPluginUnsafe(pluginId);
  });
}

async function installPaymentPluginUnsafe(pluginId: string) {
  const plugin = findPaymentProvider(pluginId);
  if (!plugin) throw new ValidationError("Unknown payment plugin");

  const cfg = await getPaymentConfig();
  if (cfg.methods.some((m) => m.id === plugin.id)) {
    throw new ValidationError(`${plugin.label} is already installed`);
  }
  await setPaymentConfig({ ...cfg, methods: [...cfg.methods, plugin.seed()] });
  revalidatePaymentPaths();
}

/** Uninstall a payment plugin and drop its method config. */
export async function uninstallPaymentPlugin(pluginId: string): Promise<ActionResult> {
  return runAction(async () => {
    await requireAdmin();
    await uninstallPaymentPluginUnsafe(pluginId);
  });
}

async function uninstallPaymentPluginUnsafe(pluginId: string) {
  const plugin = findPaymentProvider(pluginId);
  if (!plugin) throw new ValidationError("Unknown payment plugin");

  const cfg = await getPaymentConfig();
  await setPaymentConfig({
    ...cfg,
    methods: cfg.methods.filter((m) => m.id !== plugin.id),
    defaultMethodId: cfg.defaultMethodId === plugin.id ? undefined : cfg.defaultMethodId,
  });
  revalidatePaymentPaths();
}
