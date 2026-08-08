import type { PluginMeta } from "@realm/crm";
import { PAYMENTS_PLUGIN } from "@realm/payments/plugin";
import { CLOVER_PLUGIN_META } from "@realm/clover/plugin";

/** Order here is the order cards render in. */
export const PLUGIN_METAS: readonly PluginMeta[] = [PAYMENTS_PLUGIN, CLOVER_PLUGIN_META];
