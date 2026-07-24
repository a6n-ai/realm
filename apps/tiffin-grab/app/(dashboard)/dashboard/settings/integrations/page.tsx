import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/guards";
import { getPaymentConfig } from "@/lib/services/app-settings.service";
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
  const cfg = await getPaymentConfig();
  return <PluginsCatalog installedIds={cfg.methods.map((m) => m.id)} />;
}
