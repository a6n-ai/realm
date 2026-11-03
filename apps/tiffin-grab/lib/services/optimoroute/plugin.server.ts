import type { PluginServer } from "@foundry/commons/plugin";
import { slicePlugin } from "@foundry/commons/plugin-kit";
import { optimoRouteApiKey, optimoRouteSlice } from "./config";
import { OPTIMOROUTE_PLUGIN, optimoRouteNavSections } from "./plugin";

// The API key stays a server env var (it can create and delete real deliveries), so only the
// installed flag and routing options live in the slice.
export function optimoRoutePlugin(): PluginServer {
  return {
    ...slicePlugin({
      id: OPTIMOROUTE_PLUGIN.id,
      slice: optimoRouteSlice,
      statusLabel: () => (optimoRouteApiKey() ? "Connected" : "Missing API key"),
    }),
    nav: optimoRouteNavSections,
  };
}
