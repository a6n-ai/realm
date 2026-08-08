import { StarIcon } from "lucide-react";
import type { PluginMeta } from "@realm/crm";

/**
 * Client-safe Google Reviews plugin catalog metadata.
 * No secrets, no fetch — safe for Integrations UI and settings hubs.
 */
export const GOOGLE_REVIEWS_PLUGIN_ID = "googleReviews" as const;

export const GOOGLE_REVIEWS_PLUGIN = {
  id: GOOGLE_REVIEWS_PLUGIN_ID,
  label: "Google Reviews",
  description:
    "Show real Google ratings and reviews on the public site, and invite customers to leave one.",
} as const;

/** Client-safe catalog metadata for the plugin registry. Mirrors @realm/clover's CLOVER_PLUGIN_META. */
export const GOOGLE_REVIEWS_PLUGIN_META: PluginMeta = {
  id: GOOGLE_REVIEWS_PLUGIN.id,
  label: GOOGLE_REVIEWS_PLUGIN.label,
  description: GOOGLE_REVIEWS_PLUGIN.description,
  icon: StarIcon,
  settingsHref: "/dashboard/settings/google-reviews",
};
