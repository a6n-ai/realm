import type { PluginServer, PluginStatus } from "@foundry/commons/plugin";
import { getMetaPixelStatus, updateMetaPixelConfig } from "./config";
import { META_PIXEL_PLUGIN_ID } from "./plugin";

export function metaPixelPlugin(): PluginServer {
  return {
    id: META_PIXEL_PLUGIN_ID,

    async status(): Promise<PluginStatus> {
      const s = await getMetaPixelStatus();
      if (!s.installed) return { installed: false };
      return {
        installed: true,
        statusLabel: !s.pixelId ? "Missing pixel ID" : s.testEventCode ? "Test mode" : s.tokenReadable ? "Connected" : "Browser only",
      };
    },

    install: () => updateMetaPixelConfig({ installed: true }),
    uninstall: () => updateMetaPixelConfig({ installed: false }),
  };
}
