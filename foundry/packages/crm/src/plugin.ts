/**
 * The plugin contract itself lives in `@foundry/commons/plugin` (floor layer) so
 * `@foundry/payments` and other domain packages don't have to depend up into
 * `@foundry/crm` just for these types. Re-exported here for compatibility —
 * `@foundry/crm` keeps owning the components that render them.
 */
export type { PluginMeta, PluginNavItem, PluginNavSection } from "@foundry/commons/plugin";
