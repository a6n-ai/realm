import { Suspense } from "react";
import { LayersIcon } from "lucide-react";
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
  type ModifierGroupSortColumn,
} from "@/lib/services/inventory.service";
import { ModifierGroupsTable, ModifierGroupsTableSkeleton } from "./modifier-groups-table";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | undefined>>;

const MODIFIER_GROUP_SORT_COLUMNS = [
  "name",
  "status",
  "order",
  "synced",
] as const satisfies readonly ModifierGroupSortColumn[];

// Facet spec — server-authored so parseFilterState (server) and ReuiFacetFilters
// (client) stay in lockstep. "linked" is not a column; the service resolves it
// to a null check on cloverModifierGroupId.
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
    field: "showByDefault",
    label: "Shown by default",
    options: [
      { value: "true", label: "Yes" },
      { value: "false", label: "No" },
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

export default function CloverModifierGroupsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <PageShell>
      <PageHeader
        icon={LayersIcon}
        title="Modifier groups"
        subtitle="Clover modifier groups. Edits are pushed back to Clover."
        actions={
          <Suspense fallback={null}>
            <HeaderActions />
          </Suspense>
        }
      />
      <SectionCard title="All modifier groups">
        <Suspense fallback={<ModifierGroupsTableSkeleton />}>
          <GroupsData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function HeaderActions() {
  await requirePermission({ product: ["write"] });
  const clover = await getCloverConnection(integrationsConfigStore);
  if (!(await isCloverVisibleInNav())) redirect("/dashboard/settings/integrations");
  return (
    <CloverCatalogSyncActions
      cloverConnected={Boolean(clover.connected && clover.merchantId)}
    />
  );
}

async function GroupsData({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission({ product: ["read"] });
  const clover = await getCloverConnection(integrationsConfigStore);
  if (!(await isCloverVisibleInNav())) redirect("/dashboard/settings/integrations");

  const sp = await searchParams;
  const sort = parseSort(sp, MODIFIER_GROUP_SORT_COLUMNS, { column: "order", dir: "asc" });
  const { condition, page } = parseFilterState(SPEC, sp);
  const result = await inventoryCatalogService.modifierGroups.query(condition, page, sort);

  return (
    <ModifierGroupsTable
      spec={SPEC}
      rows={result.items}
      total={result.total}
      page={page.page}
      size={page.size}
      sort={sort}
    />
  );
}
