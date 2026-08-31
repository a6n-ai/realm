import { Suspense } from "react";
import { resolveStatuses } from "@foundry/crm/server";
import { requireAdmin } from "@/lib/auth/guards";
import { PLUGINS } from "@/lib/plugins.server";
import { PluginsCatalog, PluginsCatalogSkeleton } from "./plugins-catalog";

export default async function IntegrationsPage() {
  await requireAdmin();
  return (
    <Suspense fallback={<PluginsCatalogSkeleton />}>
      <PluginsCatalogLoader />
    </Suspense>
  );
}

async function PluginsCatalogLoader() {
  const statuses = await resolveStatuses(PLUGINS);
  return <PluginsCatalog statuses={statuses} />;
}
