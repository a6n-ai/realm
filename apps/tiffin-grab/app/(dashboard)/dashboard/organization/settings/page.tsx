import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/guards";
import { parseSort } from "@/lib/list/sort";
import { SectionCard } from "@/components/ds";
import { listOrganizations } from "@/lib/services/organizations.service";
import { ClientsList, ClientsListSkeleton, type ClientListRow } from "./clients-list";

type SearchParams = Promise<{ sort?: string; dir?: string }>;

export default function ClientsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <SectionCard title="Clients">
      <Suspense fallback={<ClientsListSkeleton />}>
        <ClientsData searchParams={searchParams} />
      </Suspense>
    </SectionCard>
  );
}

async function ClientsData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sort = parseSort(await searchParams, ["name", "clientCode", "memberCount"], {
    column: "name",
    dir: "asc",
  });

  const orgs = await listOrganizations();
  const nameById = new Map(orgs.map((o) => [o.id, o.name]));

  const rows: ClientListRow[] = orgs.map((o) => ({
    id: o.id,
    name: o.name,
    clientCode: o.clientCode,
    parentName: o.parentOrganizationId ? (nameById.get(o.parentOrganizationId) ?? null) : null,
    memberCount: o.memberCount,
    isBrand: !o.parentOrganizationId,
  }));

  const dir = sort.dir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const av = a[sort.column];
    const bv = b[sort.column];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });

  return <ClientsList rows={rows} sort={sort} />;
}
