import type { PluginServer, PluginStatus } from "@realm/crm/server";
import type { PaymentConfig } from "./config";
import { PAYMENTS_PLUGIN_ID } from "./plugin";

/**
 * App-injected persistence. Mirrors @realm/clover's IntegrationsConfigStore:
 * the package never imports an app or a DB client.
 *
 * `integrations` is the shared plugin blob (JSONB on the tenant row);
 * `payments` is the separate payment_config blob holding provider rows.
 */
export type PaymentsPluginDeps = {
  integrations: {
    get(): Promise<Record<string, unknown>>;
    set(cfg: Record<string, unknown>): Promise<void>;
  };
  payments: {
    get(): Promise<PaymentConfig>;
  };
};

type PaymentsPluginConfig = { installed: boolean } | undefined;

/**
 * Install state, with a read-time backfill so existing production tenants
 * report installed without a data migration: a tenant that already has payment
 * methods configured has, by definition, installed Payments.
 */
export function paymentsInstalledFrom(
  cfg: PaymentsPluginConfig,
  payments: Pick<PaymentConfig, "methods">,
): boolean {
  if (cfg) return cfg.installed;
  return payments.methods.length > 0;
}

export function paymentsPlugin(deps: PaymentsPluginDeps): PluginServer {
  const setInstalled = async (installed: boolean): Promise<void> => {
    const cfg = await deps.integrations.get();
    await deps.integrations.set({ ...cfg, [PAYMENTS_PLUGIN_ID]: { installed } });
  };

  return {
    id: PAYMENTS_PLUGIN_ID,

    async status(): Promise<PluginStatus> {
      const [integrations, payments] = await Promise.all([
        deps.integrations.get(),
        deps.payments.get(),
      ]);
      const cfg = integrations[PAYMENTS_PLUGIN_ID] as PaymentsPluginConfig;
      const installed = paymentsInstalledFrom(cfg, payments);
      const n = payments.methods.length;
      return {
        installed,
        statusLabel: installed ? `Installed · ${n} provider${n === 1 ? "" : "s"}` : undefined,
      };
    },

    install: () => setInstalled(true),

    // Providers and their tax/payee config stay in payment_config untouched —
    // uninstalling hides the Payment settings surface, it does not destroy
    // money configuration. Reinstalling restores exactly what was there.
    uninstall: () => setInstalled(false),
  };
}
