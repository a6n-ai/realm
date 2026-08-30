import { Suspense } from "react";
import { PrinterIcon } from "lucide-react";
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
import { requirePermission } from "@/lib/auth/guards";
import { parseSort } from "@/lib/list/sort";
import { integrationsConfigStore, isCloverVisibleInNav } from "@/lib/services/integrations.service";
import {
  inventoryCatalogService,
  type PrinterLabelSortColumn,
} from "@/lib/services/inventory.service";
import { LabelsTable, LabelsTableSkeleton } from "./labels-table";

type SearchParams = Promise<Record<string, string | undefined>>;

const LABEL_SORT_COLUMNS = [
  "name",
  "status",
  "synced",
] as const satisfies readonly PrinterLabelSortColumn[];

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
    field: "showInReporting",
    label: "Reporting",
    options: [
      { value: "true", label: "Shown" },
      { value: "false", label: "Hidden" },
    ],
  },
  { kind: "search", fields: ["name"] },
];

export default function CloverLabelsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <PageHeader
        icon={PrinterIcon}
        title="Printer labels"
        subtitle="Clover order-printing labels (inventory SoT). Edit them in Clover, then sync."
        actions={
          <Suspense fallback={null}>
            <HeaderActions />
          </Suspense>
        }
      />
      <SectionCard title="All printer labels">
        <Suspense fallback={<LabelsTableSkeleton />}>
          <LabelsData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function HeaderActions() {
  await requirePermission({ product: ["write"] });
  const clover = await getCloverConnection(integrationsConfigStore);
  if (!(await isCloverVisibleInNav())) redirect("/dashboard/settings/integrations");
  return <CloverCatalogSyncActions cloverConnected={Boolean(clover.connected && clover.merchantId)} />;
}

async function LabelsData({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission({ product: ["read"] });
  const clover = await getCloverConnection(integrationsConfigStore);
  if (!(await isCloverVisibleInNav())) redirect("/dashboard/settings/integrations");

  const sp = await searchParams;
  const sort = parseSort(sp, LABEL_SORT_COLUMNS, { column: "name", dir: "asc" });
  const { condition, page } = parseFilterState(SPEC, sp);
  const result = await inventoryCatalogService.printerLabels.query(condition, page, sort);

  return (
    <LabelsTable
      spec={SPEC}
      rows={result.items}
      total={result.total}
      page={page.page}
      size={page.size}
      sort={sort}
    />
  );
}
