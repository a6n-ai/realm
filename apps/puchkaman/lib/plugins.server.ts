import type { PluginRegistry } from "@foundry/crm/server";
import { cloverPlugin } from "@foundry/clover/server";
import { googleReviewsPlugin } from "@foundry/google-reviews/server";
import { integrationsConfigStore } from "@/lib/services/integrations.service";

export const PLUGINS: PluginRegistry = [
  cloverPlugin(integrationsConfigStore),
  googleReviewsPlugin(integrationsConfigStore),
];
