import type { PluginRegistry } from "@foundry/crm/server";
import { cloverPlugin } from "@foundry/clover/server";
import { paymentsPlugin } from "@foundry/payments/server";
import { googleReviewsPlugin } from "@foundry/google-reviews/server";
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
  googleReviewsPlugin(integrationsConfigStore),
];
