import { createGoogleAnalytics } from "@foundry/google-analytics";
import { integrationsMasterKey, gaMeasurementId } from "@/lib/runtime/env";
import { googleAnalyticsPlugin as plugin } from "@foundry/google-analytics/server";
import { integrationsConfigReadStore, integrationsConfigStore } from "@/lib/payments/integrations-config";

// This app's GA4: @foundry/google-analytics bound to tiffin-grab's integrations blob and master key.
// GA_MEASUREMENT_ID (SSM) keeps the site tracked until the plugin is installed, which copies it in.
export const googleAnalytics = createGoogleAnalytics({
  store: integrationsConfigStore,
  readStore: integrationsConfigReadStore,
  masterKey: integrationsMasterKey,
  legacyMeasurementId: gaMeasurementId,
});

export const googleAnalyticsPlugin = () => plugin(googleAnalytics);
export const updateGaConfig = googleAnalytics.update;
export const getGaStatus = googleAnalytics.status;
