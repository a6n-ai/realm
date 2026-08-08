import type { LucideIcon } from "lucide-react";

/**
 * Client-safe plugin catalog metadata. Imported directly by client components —
 * `icon` is a function and cannot cross the RSC server→client props boundary,
 * which is why install/uninstall live in `plugin.server.ts` instead.
 */
export type PluginMeta = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Settings route revealed once installed. */
  settingsHref?: string;
};

export type PluginNavItem = { title: string; href: string; icon: LucideIcon };
export type PluginNavSection = { label: string; items: PluginNavItem[] };
