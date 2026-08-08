import type { PluginRegistry } from "@realm/crm/server";
import { cloverPlugin } from "@realm/clover/server";
import { paymentsPlugin } from "@realm/payments/server";
import {
  getIntegrationsConfig,
  setIntegrationsConfig,
  getPaymentConfig,
  integrationsConfigStore,
} from "@/lib/services/app-settings.service";

export const PLUGINS: PluginRegistry = [
  paymentsPlugin({
    integrations: { get: getIntegrationsConfig, set: setIntegrationsConfig },
    payments: { get: getPaymentConfig },
  }),
  cloverPlugin(integrationsConfigStore),
];
