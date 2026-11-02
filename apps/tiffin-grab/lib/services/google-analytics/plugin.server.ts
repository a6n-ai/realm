import type { PluginServer, PluginStatus } from "@foundry/commons/plugin";
import { getGaConfig, getGaStatus, updateGaConfig } from "./config";
import { GA_PLUGIN_ID } from "./plugin";

export function googleAnalyticsPlugin(): PluginServer {
  return {
    id: GA_PLUGIN_ID,

    async status(): Promise<PluginStatus> {
      const s = await getGaStatus();
      if (!s.installed) return { installed: false };
      return {
        installed: true,
        statusLabel: !s.measurementId ? "Missing measurement ID" : s.secretReadable ? "Connected" : "Browser only",
      };
    },

    // First install carries over the SSM ID so the site never goes untracked in between.
    async install() {
      const cfg = await getGaConfig();
      await updateGaConfig({ installed: true, measurementId: cfg.measurementId ?? (await getGaStatus()).envMeasurementId });
    },
    uninstall: () => updateGaConfig({ installed: false }),
  };
}
