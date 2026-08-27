import { Suspense } from "react";
import { BookOpenIcon } from "lucide-react";
import { getCloverConnection } from "@realm/clover";
import {
  PageHeader,
  PageShell,
  SectionCard,
  parseFilterState,
  type FacetDef,
} from "@realm/design-system";
import { redirect } from "next/navigation";
import { CloverCatalogSyncActions } from "@/components/admin/clover-catalog-sync-actions";
import { requirePermission } from "@/lib/auth/guards";
import { parseSort } from "@/lib/list/sort";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import {
  inventoryCatalogService,
  type MenuSortColumn,
} from "@/lib/services/inventory.service";
import { MenusTable, MenusTableSkeleton } from "./menus-table";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | undefined>>;

const MENU_SORT_COLUMNS = [
  "name",
  "status",
  "order",
  "synced",
] as const satisfies readonly MenuSortColumn[];

// Facet spec — server-authored so parseFilterState (server) and ReuiFacetFilters
// (client) stay in lockstep. Mirrors Orders/Products list chrome.
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
  { kind: "search", fields: ["name"] },
];

export default function CloverMenusPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <PageShell>
      <PageHeader
        icon={BookOpenIcon}
        title="Menus"
        subtitle="Register menu layout from Clover categories. Open a menu to edit sections and save."
        actions={
          <Suspense fallback={null}>
            <HeaderActions />
          </Suspense>
        }
      />
      <SectionCard title="All menus">
        <Suspense fallback={<MenusTableSkeleton />}>
          <MenusData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function HeaderActions() {
  await requirePermission({ product: ["write"] });
  const clover = await getCloverConnection(integrationsConfigStore);
  if (!clover.installed) redirect("/dashboard/settings/integrations");
  return (
    <CloverCatalogSyncActions
      cloverConnected={Boolean(clover.connected && clover.merchantId)}
    />
  );
}

async function MenusData({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission({ product: ["read"] });
  const clover = await getCloverConnection(integrationsConfigStore);
  if (!clover.installed) redirect("/dashboard/settings/integrations");

  const sp = await searchParams;
  const sort = parseSort(sp, MENU_SORT_COLUMNS, { column: "order", dir: "asc" });
  const { condition, page } = parseFilterState(SPEC, sp);

  const result = await inventoryCatalogService.menus.queryMenus(condition, page, sort);

  return (
    <MenusTable
      spec={SPEC}
      rows={result.items}
      total={result.total}
      page={page.page}
      size={page.size}
      sort={sort}
    />
  );
}
