import { createGoogleAnalytics } from "@foundry/google-analytics";
import { googleAnalyticsPlugin as plugin } from "@foundry/google-analytics/server";
import { integrationsConfigReadStore, integrationsConfigStore } from "@/lib/services/app-settings.service";

// This app's GA4: @foundry/google-analytics bound to tiffin-grab's integrations blob and master key.
// GA_MEASUREMENT_ID (SSM) keeps the site tracked until the plugin is installed, which copies it in.
export const googleAnalytics = createGoogleAnalytics({
  store: integrationsConfigStore,
  readStore: integrationsConfigReadStore,
  masterKey: () => process.env.INTEGRATIONS_ENCRYPTION_KEY,
  legacyMeasurementId: () => process.env.GA_MEASUREMENT_ID,
});

export const googleAnalyticsPlugin = () => plugin(googleAnalytics);
export const getGaConfig = googleAnalytics.getConfig;
export const updateGaConfig = googleAnalytics.update;
export const getGaStatus = googleAnalytics.status;
