import type { PluginRegistry } from "@realm/crm/server";
import { cloverPlugin } from "@realm/clover/server";
import { googleReviewsPlugin } from "@realm/google-reviews/server";
import { integrationsConfigStore } from "@/lib/services/integrations.service";

export const PLUGINS: PluginRegistry = [
  cloverPlugin(integrationsConfigStore),
  googleReviewsPlugin(integrationsConfigStore),
];
