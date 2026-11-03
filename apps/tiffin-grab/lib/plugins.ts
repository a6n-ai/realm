import type { PluginMeta } from "@foundry/crm";
import { PAYMENTS_PLUGIN } from "@foundry/payments/plugin";
import { CLOVER_PLUGIN_META } from "@foundry/clover/plugin";
import { GOOGLE_REVIEWS_PLUGIN_META } from "@foundry/google-reviews/plugin";
import { OPTIMOROUTE_PLUGIN_META } from "./services/optimoroute/plugin";
import { META_PIXEL_PLUGIN_META } from "@foundry/meta-pixel/plugin";
import { GA_PLUGIN_META } from "@foundry/google-analytics/plugin";

// Stripe is added from Settings → Payment (provider catalog), not here.
/** Order here is the order cards render in. */
export const PLUGIN_METAS: readonly PluginMeta[] = [
  PAYMENTS_PLUGIN,
  CLOVER_PLUGIN_META,
  GOOGLE_REVIEWS_PLUGIN_META,
  OPTIMOROUTE_PLUGIN_META,
  META_PIXEL_PLUGIN_META,
  GA_PLUGIN_META,
];

export type PluginCategory = "Payments" | "Marketing" | "Operations";
export const PLUGIN_CATEGORIES: readonly PluginCategory[] = ["Payments", "Marketing", "Operations"];

/** Marketplace shelf placement and icon tile color. Keys are plugin ids. */
export const PLUGIN_DISPLAY: Record<string, { category: PluginCategory; tone: Tone }> = {
  [PAYMENTS_PLUGIN.id]: { category: "Payments", tone: "green" },
  [CLOVER_PLUGIN_META.id]: { category: "Payments", tone: "emerald" },
  [GOOGLE_REVIEWS_PLUGIN_META.id]: { category: "Marketing", tone: "amber" },
  [META_PIXEL_PLUGIN_META.id]: { category: "Marketing", tone: "blue" },
  [GA_PLUGIN_META.id]: { category: "Marketing", tone: "orange" },
  [OPTIMOROUTE_PLUGIN_META.id]: { category: "Operations", tone: "sky" },
};

/** Categorical identity only (icon tiles), each with its dark pair. */
export const TONES = {
  gray: "bg-zinc-500 text-white dark:bg-zinc-600",
  red: "bg-red-500 text-white dark:bg-red-600",
  orange: "bg-orange-500 text-white dark:bg-orange-600",
  amber: "bg-amber-500 text-white dark:bg-amber-600",
  green: "bg-green-600 text-white dark:bg-green-700",
  emerald: "bg-emerald-600 text-white dark:bg-emerald-700",
  teal: "bg-teal-600 text-white dark:bg-teal-700",
  sky: "bg-sky-500 text-white dark:bg-sky-600",
  blue: "bg-blue-600 text-white dark:bg-blue-700",
  indigo: "bg-indigo-500 text-white dark:bg-indigo-600",
  pink: "bg-pink-500 text-white dark:bg-pink-600",
} as const;
export type Tone = keyof typeof TONES;
