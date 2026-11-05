import { Suspense } from "react";
import { resolveStatuses } from "@foundry/crm/server";
import { PLUGINS } from "@/lib/plugins.server";
import { Marketplace, MarketplaceSkeleton } from "./marketplace";

export default async function IntegrationsPage() {
  return (
    <Suspense fallback={<MarketplaceSkeleton />}>
      <MarketplaceLoader />
    </Suspense>
  );
}

async function MarketplaceLoader() {
  const statuses = await resolveStatuses(PLUGINS);
  return <Marketplace statuses={statuses} />;
}
