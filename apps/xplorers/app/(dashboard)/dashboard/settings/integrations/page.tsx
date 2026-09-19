import { Suspense } from "react";
import { PuzzleIcon } from "lucide-react";
import { resolveStatuses } from "@foundry/crm/server";
import { PageHeader } from "@foundry/design-system";
import { requireAdmin } from "@/lib/auth/guards";
import { PLUGINS } from "@/lib/plugins.server";
import { PluginsCatalog, PluginsCatalogSkeleton } from "./plugins-catalog";

export default async function IntegrationsPage() {
  await requireAdmin();
  return (
    <div className="grid gap-6">
      <PageHeader
        icon={PuzzleIcon}
        title="Integrations"
        subtitle="Activate Payments to collect booking fees."
      />
      <Suspense fallback={<PluginsCatalogSkeleton />}>
        <PluginsCatalogLoader />
      </Suspense>
    </div>
  );
}

async function PluginsCatalogLoader() {
  const statuses = await resolveStatuses(PLUGINS);
  return <PluginsCatalog statuses={statuses} />;
}
