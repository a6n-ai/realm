import type { PluginMeta } from "@foundry/crm";
import { CLOVER_PLUGIN_META } from "@foundry/clover/plugin";
import { DOORDASH_PLUGIN_META } from "@foundry/doordash/plugin";
import { GOOGLE_REVIEWS_PLUGIN_META } from "@foundry/google-reviews/plugin";
import { UBER_EATS_PLUGIN_META } from "@foundry/uber-eats/plugin";

export const PLUGIN_METAS: readonly PluginMeta[] = [
  CLOVER_PLUGIN_META,
  GOOGLE_REVIEWS_PLUGIN_META,
  UBER_EATS_PLUGIN_META,
  DOORDASH_PLUGIN_META,
];
