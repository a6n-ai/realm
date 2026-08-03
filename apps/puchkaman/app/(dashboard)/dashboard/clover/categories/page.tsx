import { Suspense } from "react";
import { FolderTreeIcon } from "lucide-react";
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
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import {
  inventoryCatalogService,
  type CategorySortColumn,
} from "@/lib/services/inventory.service";
import { CategoriesTable, CategoriesTableSkeleton } from "./categories-table";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | undefined>>;

const CATEGORY_SORT_COLUMNS = [
  "name",
  "status",
  "order",
  "synced",
] as const satisfies readonly CategorySortColumn[];

// Facet spec — server-authored so parseFilterState (server) and ReuiFacetFilters
// (client) stay in lockstep. "linked" is not a column; the service resolves it
// to a null check on cloverCategoryId.
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
    field: "linked",
    label: "Clover",
    options: [
      { value: "true", label: "Linked" },
      { value: "false", label: "Not linked" },
    ],
  },
  { kind: "search", fields: ["name"] },
];

export default function CloverCategoriesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <PageShell>
      <PageHeader
        icon={FolderTreeIcon}
        title="Categories"
        subtitle="Clover Register categories (inventory SoT). Edits are pushed back to Clover."
        actions={
          <Suspense fallback={null}>
            <HeaderActions />
          </Suspense>
        }
      />
      <SectionCard title="All categories">
        <Suspense fallback={<CategoriesTableSkeleton />}>
          <CategoriesData searchParams={searchParams} />
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
      showPushCategories
    />
  );
}

async function CategoriesData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const clover = await getCloverConnection(integrationsConfigStore);
  if (!clover.installed) redirect("/dashboard/settings/integrations");

  const sp = await searchParams;
  const sort = parseSort(sp, CATEGORY_SORT_COLUMNS, { column: "order", dir: "asc" });
  const { condition, page } = parseFilterState(SPEC, sp);
  const result = await inventoryCatalogService.categories.query(condition, page, sort);

  return (
    <CategoriesTable
      spec={SPEC}
      rows={result.items}
      total={result.total}
      page={page.page}
      size={page.size}
      sort={sort}
    />
  );
}
