import { CreditCardIcon } from "lucide-react";
import type { PluginMeta } from "@realm/crm";

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
