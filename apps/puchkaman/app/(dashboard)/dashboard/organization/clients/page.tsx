import { Suspense } from "react";
import { SectionCard, parseFilterState, type FacetDef } from "@realm/design-system";
import { requireAdmin } from "@/lib/auth/guards";
import { parseSort } from "@/lib/list/sort";
import { queryOrganizations, type OrgSortColumn } from "@/lib/services/organizations.service";
import { ClientsTable, ClientsTableSkeleton } from "./clients-table";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | undefined>>;

// Facet spec — server-authored so parseFilterState (server) and ReuiFacetFilters
// (client) stay in lockstep, same convention as settings/users/page.tsx.
export const SPEC: FacetDef[] = [
  {
    kind: "pills",
    field: "type",
    label: "Type",
    options: [
      { value: "brand", label: "Brand" },
      { value: "franchise", label: "Franchise" },
    ],
  },
  { kind: "search", fields: ["name", "clientCode"] },
];

const ORG_SORT_COLUMNS = ["name", "clientCode"] as const satisfies readonly OrgSortColumn[];

export default function ClientsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <SectionCard title="All clients">
      <Suspense fallback={<ClientsTableSkeleton />}>
        <ClientsData searchParams={searchParams} />
      </Suspense>
    </SectionCard>
  );
}

async function ClientsData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();

  const sp = await searchParams;
  const sort = parseSort(sp, ORG_SORT_COLUMNS, { column: "name", dir: "asc" });
  const { condition, page } = parseFilterState(SPEC, sp);

  const result = await queryOrganizations(condition, page, sort);

  return <ClientsTable spec={SPEC} rows={result.items} total={result.total} page={page.page} size={page.size} sort={sort} />;
}
