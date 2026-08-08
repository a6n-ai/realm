import { CreditCardIcon } from "lucide-react";
import type { PluginNavSection } from "@realm/crm";
import type { PluginServer, PluginStatus } from "@realm/crm/server";
import { CLOVER_PLUGIN } from "./plugin";
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

    nav(status): PluginNavSection[] {
      if (!status.installed) return [];
      return [
        {
          label: "Clover",
          items: [
            { title: "Connection", href: "/dashboard/settings/clover", icon: CreditCardIcon },
          ],
        },
      ];
    },
  };
}
