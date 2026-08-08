import type { PluginNavSection } from "./plugin";

export type { IntegrationsConfigStore } from "./config-store";

export type PluginStatus = {
  installed: boolean;
  /** e.g. "Installed" / "Connected" — shown on the catalog card. */
  statusLabel?: string;
};

export type PluginServer = {
  id: string;
  status(): Promise<PluginStatus>;
  install(): Promise<void>;
  uninstall(): Promise<void>;
  /** Plugin ids that must be installed before this one can be. */
  requires?: string[];
  /** Nav this plugin contributes when installed. */
  nav?(status: PluginStatus): PluginNavSection[];
};

export type PluginRegistry = readonly PluginServer[];

export async function resolveStatuses(
  registry: PluginRegistry,
): Promise<Record<string, PluginStatus>> {
  const entries = await Promise.all(
    registry.map(async (p) => [p.id, await p.status()] as const),
  );
  return Object.fromEntries(entries);
}

/** Forward check: which of this plugin's requirements are not installed. */
export function blockedBy(
  registry: PluginRegistry,
  id: string,
  statuses: Record<string, PluginStatus>,
): string[] {
  const plugin = registry.find((p) => p.id === id);
  if (!plugin?.requires) return [];
  return plugin.requires.filter((req) => !statuses[req]?.installed);
}

/**
 * Backward check: which plugins would break if this one were uninstalled.
 * Without this an admin can revoke Clover and leave a payment provider
 * pointing at dead tokens — which fails at charge time, in front of a customer.
 */
export function dependents(registry: PluginRegistry, id: string): string[] {
  return registry.filter((p) => p.requires?.includes(id)).map((p) => p.id);
}
