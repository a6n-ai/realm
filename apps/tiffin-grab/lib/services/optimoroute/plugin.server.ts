import type { PluginServer, PluginStatus } from "@foundry/commons/plugin";
import { getOptimoRouteConfig, getOptimoRouteStatus, setOptimoRouteConfig } from "./config";
import { OPTIMOROUTE_PLUGIN, optimoRouteNavSections } from "./plugin";

// App-local — unlike Clover/Google Reviews, reads/writes go straight through
// config.ts's own getIntegrationsConfig/setIntegrationsConfig, no store arg needed.
export function optimoRoutePlugin(): PluginServer {
  return {
    id: OPTIMOROUTE_PLUGIN.id,

    async status(): Promise<PluginStatus> {
      const s = await getOptimoRouteStatus();
      return {
        installed: s.installed,
        statusLabel: !s.installed ? undefined : s.hasApiKey ? "Connected" : "Missing API key",
      };
    },

    async install() {
      const cfg = await getOptimoRouteConfig();
      await setOptimoRouteConfig({ ...cfg, installed: true });
    },

    async uninstall() {
      const cfg = await getOptimoRouteConfig();
      await setOptimoRouteConfig({ ...cfg, installed: false });
    },

    nav: optimoRouteNavSections,
  };
}
