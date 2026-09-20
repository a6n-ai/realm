"use server";

import { revalidatePath } from "next/cache";
import { ValidationError } from "@foundry/commons";
import { paymentConfigSchema, type PaymentConfig } from "@foundry/payments";
import { findPaymentProvider } from "@foundry/payments/providers";
import { requireAdmin } from "@/lib/auth/guards";
import { runAction, type ActionResult } from "@/app/(customer)/me/action-result";
import { getPaymentConfig, setPaymentConfig } from "@/lib/services/app-settings.service";

// Expected failures are RETURNED (runAction): thrown errors are redacted to "Minified React error #441" in prod.
// Saves the whole payment config in one shot (the blob is small). Beyond the schema shape,
// enforce app-level rules the shared schema can't know: unique method ids and a payee handle
// on any enabled manual method (otherwise customers get instructions with no destination).
export async function savePaymentConfig(cfg: PaymentConfig): Promise<ActionResult> {
  await requireAdmin();
  return runAction(() => savePaymentConfigUnsafe(cfg));
}

async function savePaymentConfigUnsafe(cfg: PaymentConfig) {
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
  revalidatePath("/dashboard/settings/payments", "layout");
  revalidatePath("/dashboard/settings/integrations");
}

/** Install a catalog payment plugin (adds its method stub to payment_config). */
export async function installPaymentPlugin(pluginId: string): Promise<ActionResult> {
  await requireAdmin();
  return runAction(() => installPaymentPluginUnsafe(pluginId));
}

async function installPaymentPluginUnsafe(pluginId: string) {  const plugin = findPaymentProvider(pluginId);
  if (!plugin) throw new ValidationError("Unknown payment plugin");

  const cfg = await getPaymentConfig();
  if (cfg.methods.some((m) => m.id === plugin.id)) {
    throw new ValidationError(`${plugin.label} is already installed`);
  }
  await setPaymentConfig({ ...cfg, methods: [...cfg.methods, plugin.seed()] });
  revalidatePath("/dashboard/settings/payments", "layout");
  revalidatePath("/dashboard/settings/integrations");
}

/** Uninstall a payment plugin and drop its method config. */
export async function uninstallPaymentPlugin(pluginId: string): Promise<ActionResult> {
  await requireAdmin();
  return runAction(() => uninstallPaymentPluginUnsafe(pluginId));
}

async function uninstallPaymentPluginUnsafe(pluginId: string) {  const plugin = findPaymentProvider(pluginId);
  if (!plugin) throw new ValidationError("Unknown payment plugin");

  const cfg = await getPaymentConfig();
  await setPaymentConfig({
    ...cfg,
    methods: cfg.methods.filter((m) => m.id !== plugin.id),
    defaultMethodId: cfg.defaultMethodId === plugin.id ? undefined : cfg.defaultMethodId,
  });
  revalidatePath("/dashboard/settings/payments", "layout");
  revalidatePath("/dashboard/settings/integrations");
}
