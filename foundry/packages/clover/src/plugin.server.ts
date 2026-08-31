import type { PluginServer, PluginStatus } from "@foundry/commons/plugin";
import { CLOVER_PLUGIN, cloverNavSections } from "./plugin";
import { getCloverConnection, installCloverPlugin, uninstallCloverPlugin } from "./store";
import type { IntegrationsConfigStore } from "./store";

export function cloverPlugin(store: IntegrationsConfigStore): PluginServer {
  return {
    id: CLOVER_PLUGIN.id,

    async status(): Promise<PluginStatus> {
      const conn = await getCloverConnection(store);
      return {
        installed: conn.installed,
        statusLabel: !conn.installed ? undefined : conn.connected ? "Connected" : "Installed",
      };
    },

    install: () => installCloverPlugin(store),
    uninstall: () => uninstallCloverPlugin(store),

    nav: cloverNavSections,
  };
}
