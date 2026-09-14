import type { PluginMeta } from "@foundry/crm";
import { PAYMENTS_PLUGIN } from "@foundry/payments/plugin";
import { CLOVER_PLUGIN_META } from "@foundry/clover/plugin";
import { GOOGLE_REVIEWS_PLUGIN_META } from "@foundry/google-reviews/plugin";
import { OPTIMOROUTE_PLUGIN_META } from "./services/optimoroute/plugin";

/** Order here is the order cards render in. */
export const PLUGIN_METAS: readonly PluginMeta[] = [
  PAYMENTS_PLUGIN,
  CLOVER_PLUGIN_META,
  GOOGLE_REVIEWS_PLUGIN_META,
  OPTIMOROUTE_PLUGIN_META,
];
