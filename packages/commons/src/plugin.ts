import type { LucideIcon } from "lucide-react";

/**
 * The plugin contract, floor-level so every package that models an
 * installable feature (payments, Clover, Google Reviews, …) can depend on
 * it without reaching up into `@realm/crm`. `@realm/crm` re-exports these
 * for compatibility and owns the components that render them
 * (`PluginCatalog`, `IntegrationPluginCard`).
 */

/**
 * Client-safe plugin catalog metadata. Imported directly by client components —
 * `icon` is a function and cannot cross the RSC server→client props boundary,
 * which is why install/uninstall live in a separate `plugin.server.ts` per package.
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

export type PluginStatus = {
  installed: boolean;
  /** e.g. "Installed" / "Connected" — shown on the catalog card. */
  statusLabel?: string;
};

/**
 * App-injected persistence for the shared plugin config blob (JSONB on the
 * tenant row). Every plugin package takes this; none imports an app or a DB.
 * `.loose()` parsing on the app side is what lets plugins coexist in one blob.
 */
export type IntegrationsConfigStore<T = Record<string, unknown>> = {
  get(): Promise<T>;
  set(cfg: T): Promise<void>;
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
