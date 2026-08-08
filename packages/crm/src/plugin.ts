/**
 * The plugin contract itself lives in `@realm/commons/plugin` (floor layer) so
 * `@realm/payments` and other domain packages don't have to depend up into
 * `@realm/crm` just for these types. Re-exported here for compatibility —
 * `@realm/crm` keeps owning the components that render them.
 */
export type { PluginMeta, PluginNavItem, PluginNavSection } from "@realm/commons/plugin";
