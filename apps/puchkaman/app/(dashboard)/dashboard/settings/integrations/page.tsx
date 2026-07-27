import { Suspense } from "react";
import { getCloverConnection, toPublicCloverConnection } from "@realm/clover";
import { requireAdmin } from "@/lib/auth/guards";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
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
  const connection = await getCloverConnection(integrationsConfigStore);
  return <PluginsCatalog clover={toPublicCloverConnection(connection)} />;
}
