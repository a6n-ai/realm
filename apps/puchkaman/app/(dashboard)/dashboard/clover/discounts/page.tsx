import { Suspense } from "react";
import { PercentIcon } from "lucide-react";
import { getCloverConnection } from "@realm/clover";
import { PageHeader, PageShell, SectionCard } from "@realm/design-system";
import { redirect } from "next/navigation";
import { CloverCatalogSyncActions } from "@/components/admin/clover-catalog-sync-actions";
import { requireAdmin } from "@/lib/auth/guards";
import { DiscountsTable } from "./discounts-table";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { inventoryCatalogService } from "@/lib/services/inventory.service";

export const dynamic = "force-dynamic";

export default function CloverDiscountsPage() {
  return (
    <PageShell>
      <PageHeader
        icon={PercentIcon}
        title="Discounts"
        subtitle="Clover inventory discounts. Toggle one to offer it at checkout, or give it a coupon code."
        actions={
          <Suspense fallback={null}>
            <HeaderActions />
          </Suspense>
        }
      />
      <SectionCard title="All discounts">
        <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
          <DiscountsTableSection />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function HeaderActions() {
  await requireAdmin();
  const clover = await getCloverConnection(integrationsConfigStore);
  if (!clover.installed) redirect("/dashboard/settings/integrations");
  return (
    <CloverCatalogSyncActions
      cloverConnected={Boolean(clover.connected && clover.merchantId)}
    />
  );
}

async function DiscountsTableSection() {
  await requireAdmin();
  const clover = await getCloverConnection(integrationsConfigStore);
  if (!clover.installed) redirect("/dashboard/settings/integrations");

  const rows = await inventoryCatalogService.discounts.listAll();

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No discounts yet. Sync from Clover to pull them.
      </p>
    );
  }

  return <DiscountsTable rows={rows} />;
}
