import { resolveStatuses } from "@foundry/crm/server";
import { PAYMENT_PROVIDERS } from "@foundry/payments/providers";
import { PLUGINS } from "@/lib/plugins.server";
import { ProviderCatalog } from "./provider-catalog";

/**
 * Shared by the zero-method index page and the /payments/add "add another" route.
 * A plugin provider (Stripe) counts as added only while its plugin is installed: its
 * method row outlives a disconnect, so `methodIds` alone would hide it from the catalog.
 */
export async function ProviderCatalogLoader({ methodIds }: { methodIds: string[] }) {
  const statuses = await resolveStatuses(PLUGINS);
  const installedIds = PAYMENT_PROVIDERS.filter((p) =>
    p.requiresPlugin ? statuses[p.requiresPlugin]?.installed : methodIds.includes(p.id),
  ).map((p) => p.id);
  const blockedPluginIds = Object.entries(statuses)
    .filter(([, s]) => !s.installed)
    .map(([id]) => id);
  return <ProviderCatalog installedIds={installedIds} blockedPluginIds={blockedPluginIds} />;
}
