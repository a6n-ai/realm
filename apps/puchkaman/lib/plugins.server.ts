import type { PluginRegistry } from "@foundry/crm/server";
import { cloverPlugin } from "@foundry/clover/server";
import { doorDashPlugin } from "@foundry/doordash/server";
import { googleReviewsPlugin } from "@foundry/google-reviews/server";
import { uberEatsPlugin } from "@foundry/uber-eats/server";
import { integrationsConfigStore } from "@/lib/services/integrations.service";

export const PLUGINS: PluginRegistry = [
  cloverPlugin(integrationsConfigStore),
  googleReviewsPlugin(integrationsConfigStore),
  uberEatsPlugin(integrationsConfigStore),
  doorDashPlugin(integrationsConfigStore),
];
