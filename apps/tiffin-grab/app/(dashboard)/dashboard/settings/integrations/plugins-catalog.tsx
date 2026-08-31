"use client";

import { PluginCatalog, PluginCatalogSkeleton, type PluginCatalogStatus } from "@foundry/crm";
import { PLUGIN_METAS } from "@/lib/plugins";
import { setPluginInstalledAction } from "./actions";

export function PluginsCatalog({
  statuses,
}: {
  statuses: Record<string, PluginCatalogStatus>;
}) {
  return (
    <PluginCatalog
      metas={PLUGIN_METAS}
      statuses={statuses}
      setInstalled={setPluginInstalledAction}
    />
  );
}

export function PluginsCatalogSkeleton() {
  return <PluginCatalogSkeleton count={PLUGIN_METAS.length} />;
}
