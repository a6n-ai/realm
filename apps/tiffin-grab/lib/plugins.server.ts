import type { PluginRegistry } from "@realm/crm/server";
import { paymentsPlugin } from "@realm/payments/server";
import {
  getIntegrationsConfig,
  setIntegrationsConfig,
  getPaymentConfig,
} from "@/lib/services/app-settings.service";

export const PLUGINS: PluginRegistry = [
  paymentsPlugin({
    integrations: { get: getIntegrationsConfig, set: setIntegrationsConfig },
    payments: { get: getPaymentConfig },
  }),
];
