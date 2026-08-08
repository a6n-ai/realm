import { Suspense } from "react";
import { redirect } from "next/navigation";
import { resolveStatuses } from "@realm/crm/server";
import { requireAdmin } from "@/lib/auth/guards";
import { getPaymentConfig } from "@/lib/services/app-settings.service";
import { PLUGINS } from "@/lib/plugins.server";
import { ProviderCatalog, ProviderCatalogSkeleton } from "./provider-catalog";

export default async function PaymentsSettingsIndex() {
  await requireAdmin();
  const cfg = await getPaymentConfig();
  const first = cfg.methods[0];
  if (first) redirect(`/dashboard/settings/payments/${first.id}`);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="font-medium">Add a payment provider</p>
        <p className="text-muted-foreground text-sm">
          Install one below to start accepting payments — this is the Payments plugin's own
          settings surface, separate from Integrations.
        </p>
      </div>
      <Suspense fallback={<ProviderCatalogSkeleton />}>
        <ProviderCatalogLoader />
      </Suspense>
    </div>
  );
}

async function ProviderCatalogLoader() {
  const statuses = await resolveStatuses(PLUGINS);
  const blockedPluginIds = Object.entries(statuses)
    .filter(([, s]) => !s.installed)
    .map(([id]) => id);
  return <ProviderCatalog blockedPluginIds={blockedPluginIds} />;
}
