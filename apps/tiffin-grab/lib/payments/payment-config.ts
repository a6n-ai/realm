import { parsePaymentConfig, type PaymentConfig } from "@foundry/payments";
import { mergePaymentCatalog } from "@foundry/payments/providers";
import { saveSetting, settingsCache } from "@/lib/settings";
import { db } from "@/db/client";
import { app } from "@/db/schema";
import { installedPlugins } from "./integrations-config";

// Enabled payment methods + per-method taxes. NULL/garbage → no methods (simulated mode),
// so the app keeps its current behavior until an admin enables one. Cached like discountPolicy.
export async function getPaymentConfig(): Promise<PaymentConfig> {
  return settingsCache.getOrSet("paymentConfig", async () => {
    const [row] = await db.select({ pc: app.paymentConfig }).from(app).limit(1);
    return parsePaymentConfig(row?.pc ?? undefined);
  });
}

// Uncached: read-modify-write callers must not start from a stale (other-instance) cache.
export async function getPaymentConfigFresh(): Promise<PaymentConfig> {
  const [row] = await db.select({ pc: app.paymentConfig }).from(app).limit(1);
  return parsePaymentConfig(row?.pc ?? undefined);
}

export async function setPaymentConfig(cfg: PaymentConfig): Promise<void> {
  const parsed = parsePaymentConfig(cfg);
  await saveSetting({ paymentConfig: parsed });
}

/**
 * Seed cash (on) + e-Transfer from Foundry's catalog.
 */
export async function ensurePaymentCatalog(): Promise<PaymentConfig> {
  const cfg = await getPaymentConfig();
  const hadManual = cfg.methods.some((m) => m.id === "manual");
  const installed = await installedPlugins();
  const merged = mergePaymentCatalog(cfg, installed);
  const methods = merged.methods
    .filter((m) => m.id !== "manual")
    .map((m) => (m.id === "cash" && hadManual ? { ...m, enabled: true } : m));
  const next: PaymentConfig = { ...merged, methods };
  const unchanged =
    next.methods.length === cfg.methods.length &&
    next.methods.every((m, i) => {
      const prev = cfg.methods[i];
      return prev && prev.id === m.id && prev.enabled === m.enabled && prev.label === m.label;
    });
  if (unchanged) return cfg;
  await setPaymentConfig(next);
  return next;
}
