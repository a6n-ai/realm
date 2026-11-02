import { ChartLineIcon } from "lucide-react";
import type { PluginMeta } from "@foundry/commons/plugin";

export const GA_PLUGIN_ID = "google-analytics" as const;
export const GA_SETTINGS_HREF = "/dashboard/settings/google-analytics";

/** Client-safe catalog metadata. */
export const GA_PLUGIN_META: PluginMeta = {
  id: GA_PLUGIN_ID,
  label: "Google Analytics",
  description: "GA4 visitors, traffic sources, and conversions, with server-side purchases.",
  icon: ChartLineIcon,
  settingsHref: GA_SETTINGS_HREF,
};
