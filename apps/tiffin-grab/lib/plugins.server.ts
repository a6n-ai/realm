import type { PluginRegistry } from "@foundry/crm/server";
import { cloverPlugin } from "@foundry/clover/server";
import { paymentsPlugin } from "@foundry/payments/server";
import { googleReviewsPlugin } from "@foundry/google-reviews/server";
import { optimoRoutePlugin } from "./services/optimoroute/plugin.server";
import {
  getIntegrationsConfig,
  setIntegrationsConfig,
  getPaymentConfig,
  ensurePaymentCatalog,
  integrationsConfigStore,
} from "@/lib/services/app-settings.service";

const payments = paymentsPlugin({
  integrations: { get: getIntegrationsConfig, set: setIntegrationsConfig },
  payments: { get: getPaymentConfig },
});

export const PLUGINS: PluginRegistry = [
  {
    ...payments,
    async install() {
      await payments.install();
      await ensurePaymentCatalog();
    },
  },
  cloverPlugin(integrationsConfigStore),
  googleReviewsPlugin(integrationsConfigStore),
  optimoRoutePlugin(),
];
