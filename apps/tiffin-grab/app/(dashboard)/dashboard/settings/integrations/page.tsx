import { Suspense } from "react";
import { getCloverConnection, toPublicCloverConnection } from "@realm/clover";
import { requireAdmin } from "@/lib/auth/guards";
import {
  getPaymentConfig,
  integrationsConfigStore,
} from "@/lib/services/app-settings.service";
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
  const [cfg, connection] = await Promise.all([
    getPaymentConfig(),
    getCloverConnection(integrationsConfigStore),
  ]);
  return (
    <PluginsCatalog
      installedIds={cfg.methods.map((m) => m.id)}
      clover={toPublicCloverConnection(connection)}
    />
  );
}
