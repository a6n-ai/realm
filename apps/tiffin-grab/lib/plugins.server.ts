import type { PluginRegistry } from "@foundry/crm/server";
import { cloverPlugin } from "@foundry/clover/server";
import { paymentsPlugin } from "@foundry/payments/server";
import { stripePlugin } from "@foundry/payments/stripe";
import { googleReviewsPlugin } from "@foundry/google-reviews/server";
import { stripeDeps } from "@/lib/payments/stripe";
import { optimoRoutePlugin } from "./optimoroute/plugin.server";
import { metaPixelPlugin } from "./services/meta-pixel/config";
import { googleAnalyticsPlugin } from "./services/google-analytics/config";
import { getIntegrationsConfigFresh, setIntegrationsConfig, integrationsConfigStore } from "@/lib/payments/integrations-config";
import { getPaymentConfig, ensurePaymentCatalog } from "@/lib/payments/payment-config";

const payments = paymentsPlugin({
  integrations: { get: getIntegrationsConfigFresh, set: setIntegrationsConfig },
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
  {
    ...stripePlugin(stripeDeps),
    async install() {
      await stripePlugin(stripeDeps).install();
      await ensurePaymentCatalog();
    },
  },
  cloverPlugin(integrationsConfigStore),
  googleReviewsPlugin(integrationsConfigStore),
  optimoRoutePlugin(),
  metaPixelPlugin(),
  googleAnalyticsPlugin(),
];
