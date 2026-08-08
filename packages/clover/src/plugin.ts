import { CreditCardIcon } from "lucide-react";
import type { PluginMeta, PluginNavSection, PluginStatus } from "@realm/commons/plugin";

/**
 * Client-safe Clover plugin catalog metadata.
 * No secrets, no fetch — safe for Integrations UI and settings hubs.
 */
export const CLOVER_PLUGIN_ID = "clover" as const;

export const CLOVER_PLUGIN = {
  id: CLOVER_PLUGIN_ID,
  label: "Clover",
  description:
    "Connect a Clover merchant account (sandbox or production) for payments and catalog sync in later phases.",
} as const;

/** Client-safe catalog metadata for the plugin registry. Mirrors @realm/payments's PAYMENTS_PLUGIN. */
export const CLOVER_PLUGIN_META: PluginMeta = {
  id: CLOVER_PLUGIN.id,
  label: CLOVER_PLUGIN.label,
  description: CLOVER_PLUGIN.description,
  icon: CreditCardIcon,
  settingsHref: "/dashboard/settings/clover",
};

/**
 * Pure, client-safe nav contribution — a sync function of status only, so an
 * app sidebar (a client component) can call it directly to compose its nav
 * without pulling the store-bound `cloverPlugin(store)` factory into the
 * client bundle. `plugin.server.ts`'s `PluginServer.nav` delegates to this
 * same implementation so there is exactly one copy of the logic.
 */
export function cloverNavSections(status: PluginStatus): PluginNavSection[] {
  if (!status.installed) return [];
  return [
    {
      label: "Clover",
      items: [{ title: "Connection", href: "/dashboard/settings/clover", icon: CreditCardIcon }],
    },
  ];
}
