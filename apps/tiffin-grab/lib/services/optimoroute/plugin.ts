import { TruckIcon } from "lucide-react";
import type { PluginMeta, PluginNavSection, PluginStatus } from "@foundry/commons/plugin";

export const OPTIMOROUTE_PLUGIN_ID = "optimoroute" as const;

export const OPTIMOROUTE_PLUGIN = {
  id: OPTIMOROUTE_PLUGIN_ID,
  label: "OptimoRoute",
  description: "Route planning and driver dispatch for tiffin deliveries.",
} as const;

/** Client-safe catalog metadata for the plugin registry. Mirrors @foundry/clover's CLOVER_PLUGIN_META. */
export const OPTIMOROUTE_PLUGIN_META: PluginMeta = {
  id: OPTIMOROUTE_PLUGIN.id,
  label: OPTIMOROUTE_PLUGIN.label,
  description: OPTIMOROUTE_PLUGIN.description,
  icon: TruckIcon,
  settingsHref: "/dashboard/settings/optimoroute",
};

/** Pure, client-safe — mirrors @foundry/clover's cloverNavSections. */
export function optimoRouteNavSections(status: PluginStatus): PluginNavSection[] {
  if (!status.installed) return [];
  return [
    {
      label: "OptimoRoute",
      items: [{ title: "Connection", href: "/dashboard/settings/optimoroute", icon: TruckIcon }],
    },
  ];
}
