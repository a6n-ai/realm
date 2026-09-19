import type { PluginRegistry } from "@foundry/crm/server";
import { PAYMENTS_PLUGIN_ID } from "@foundry/payments/plugin";
import { paymentsPlugin } from "@foundry/payments/server";
import {
  ensurePaymentCatalog,
  getIntegrationsConfig,
  getPaymentConfig,
  setIntegrationsConfig,
} from "@/lib/services/app-settings.service";

const payments = paymentsPlugin({
  integrations: { get: getIntegrationsConfig, set: setIntegrationsConfig },
  payments: { get: getPaymentConfig },
});

export const PLUGINS: PluginRegistry = [
  {
    ...payments,
    async status() {
      const cfg = await getIntegrationsConfig();
      const flag = cfg[PAYMENTS_PLUGIN_ID] as { installed?: boolean } | undefined;
      return {
        installed: Boolean(flag?.installed),
        statusLabel: flag?.installed ? "Active" : undefined,
      };
    },
    async install() {
      await payments.install();
      await ensurePaymentCatalog();
    },
  },
];
