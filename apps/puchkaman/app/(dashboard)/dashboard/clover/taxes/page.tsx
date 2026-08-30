import { Suspense } from "react";
import { PercentIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { getCloverConnection } from "@realm/clover";
import {
  PageHeader,
  PageShell,
  SectionCard,
  parseFilterState,
  type FacetDef,
} from "@realm/design-system";
import { CloverCatalogSyncActions } from "@/components/admin/clover-catalog-sync-actions";
import { requireAdmin } from "@/lib/auth/guards";
import { parseSort } from "@/lib/list/sort";
import { integrationsConfigStore, isCloverVisibleInNav } from "@/lib/services/integrations.service";
import { inventoryCatalogService, type TaxRateSortColumn } from "@/lib/services/inventory.service";
import { TaxesTable, TaxesTableSkeleton } from "./taxes-table";

type SearchParams = Promise<Record<string, string | undefined>>;

const TAX_SORT_COLUMNS = [
  "name",
  "rate",
  "status",
  "synced",
] as const satisfies readonly TaxRateSortColumn[];

const SPEC: FacetDef[] = [
  {
    kind: "pills",
    field: "active",
    label: "Status",
    options: [
      { value: "true", label: "Active" },
      { value: "false", label: "Inactive" },
    ],
  },
  {
    kind: "pills",
    field: "isDefault",
    label: "Default",
    options: [
      { value: "true", label: "Default" },
      { value: "false", label: "Not default" },
    ],
  },
  { kind: "search", fields: ["name"] },
];

export default function CloverTaxesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <PageHeader
        icon={PercentIcon}
        title="Taxes and fees"
        subtitle="Clover tax rates (inventory SoT). Edit them in Clover, then sync."
        actions={
          <Suspense fallback={null}>
            <HeaderActions />
          </Suspense>
        }
      />
      <SectionCard title="All taxes and fees">
        <Suspense fallback={<TaxesTableSkeleton />}>
          <TaxesData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function HeaderActions() {
  await requireAdmin();
  const clover = await getCloverConnection(integrationsConfigStore);
  if (!(await isCloverVisibleInNav())) redirect("/dashboard/settings/integrations");
  return <CloverCatalogSyncActions cloverConnected={Boolean(clover.connected && clover.merchantId)} />;
}

async function TaxesData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const clover = await getCloverConnection(integrationsConfigStore);
  if (!(await isCloverVisibleInNav())) redirect("/dashboard/settings/integrations");

  const sp = await searchParams;
  const sort = parseSort(sp, TAX_SORT_COLUMNS, { column: "name", dir: "asc" });
  const { condition, page } = parseFilterState(SPEC, sp);
  const result = await inventoryCatalogService.taxRates.query(condition, page, sort);

  return (
    <TaxesTable
      spec={SPEC}
      rows={result.items}
      total={result.total}
      page={page.page}
      size={page.size}
      sort={sort}
    />
  );
}
