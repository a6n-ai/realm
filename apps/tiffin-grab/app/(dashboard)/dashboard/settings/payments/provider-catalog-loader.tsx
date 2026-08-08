import { resolveStatuses } from "@realm/crm/server";
import { PLUGINS } from "@/lib/plugins.server";
import { ProviderCatalog } from "./provider-catalog";

/** Shared by the zero-method index page and the /payments/add "add another" route. */
export async function ProviderCatalogLoader({ installedIds }: { installedIds: string[] }) {
  const statuses = await resolveStatuses(PLUGINS);
  const blockedPluginIds = Object.entries(statuses)
    .filter(([, s]) => !s.installed)
    .map(([id]) => id);
  return <ProviderCatalog installedIds={installedIds} blockedPluginIds={blockedPluginIds} />;
}
