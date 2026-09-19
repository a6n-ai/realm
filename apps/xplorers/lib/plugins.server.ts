import type { PluginRegistry } from "@foundry/crm/server";
import { paymentsPlugin } from "@foundry/payments/server";
import { getIntegrationsConfig, getPaymentConfig, setIntegrationsConfig } from "@/lib/services/app-settings.service";

export const PLUGINS: PluginRegistry = [
  paymentsPlugin({
    integrations: { get: getIntegrationsConfig, set: setIntegrationsConfig },
    payments: { get: getPaymentConfig },
  }),
];
