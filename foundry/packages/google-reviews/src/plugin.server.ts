import type { IntegrationsConfigStore, PluginServer, PluginStatus } from "@foundry/commons/plugin";
import { GOOGLE_REVIEWS_PLUGIN_ID } from "./plugin";
import { getGoogleReviewsConfig, installGoogleReviews, uninstallGoogleReviews } from "./store";

export function googleReviewsPlugin(store: IntegrationsConfigStore): PluginServer {
  return {
    id: GOOGLE_REVIEWS_PLUGIN_ID,

    async status(): Promise<PluginStatus> {
      const cfg = await getGoogleReviewsConfig(store);
      if (!cfg.installed) return { installed: false };
      return {
        installed: true,
        statusLabel: cfg.placeId ? "Installed" : "Installed · needs a Place ID",
      };
    },

    install: () => installGoogleReviews(store),
    uninstall: () => uninstallGoogleReviews(store),
  };
}
