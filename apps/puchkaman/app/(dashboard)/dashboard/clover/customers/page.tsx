import { Suspense } from "react";
import { ContactIcon } from "lucide-react";
import { getCloverConnection } from "@realm/clover";
import { PageHeader, PageShell, SectionCard, parseFilterState, type FacetDef } from "@realm/design-system";
import { redirect } from "next/navigation";
import { CloverCustomersSyncActions } from "@/components/admin/clover-customers-sync-actions";
import { requirePermission } from "@/lib/auth/guards";
import { parseSort } from "@/lib/list/sort";
import { cloverCustomersService } from "@/lib/services/clover-customers.service";
import type { CloverCustomerSortColumn } from "@/lib/services/customers.repository";
import { integrationsConfigStore, isCloverVisibleInNav } from "@/lib/services/integrations.service";
import { CloverCustomersTable, CloverCustomersTableSkeleton } from "./clover-customers-table";

type SearchParams = Promise<Record<string, string | undefined>>;

const SORT_COLUMNS = ["name", "email", "customerSince"] as const satisfies readonly CloverCustomerSortColumn[];

const SPEC: FacetDef[] = [{ kind: "search", fields: ["name", "email", "phone"] }];

export default function CloverCustomersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <PageHeader
        icon={ContactIcon}
        title="Customers"
        subtitle="Clover's Customer Directory for this franchise — distinct from our own app customers."
        actions={
          <Suspense fallback={null}>
            <HeaderActions />
          </Suspense>
        }
      />
      <SectionCard title="All customers">
        <Suspense fallback={<CloverCustomersTableSkeleton />}>
          <CustomersData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function HeaderActions() {
  await requirePermission({ clover: ["read"] });
  const clover = await getCloverConnection(integrationsConfigStore);
  if (!(await isCloverVisibleInNav())) redirect("/dashboard/settings/integrations");
  return <CloverCustomersSyncActions cloverConnected={Boolean(clover.connected && clover.merchantId)} />;
}

async function CustomersData({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission({ clover: ["read"] });
  const clover = await getCloverConnection(integrationsConfigStore);
  if (!(await isCloverVisibleInNav())) redirect("/dashboard/settings/integrations");

  const sp = await searchParams;
  const sort = parseSort(sp, SORT_COLUMNS, { column: "name", dir: "asc" });
  const { condition, page } = parseFilterState(SPEC, sp);

  const result = await cloverCustomersService.listPage(condition, page, sort);

  // "Client" only shows for a brand admin's cross-franchise view — every row
  // carries clientCode there (see resolveOrgScopeMode); a franchise-scoped
  // session never gets it.
  const showClient = result.items.some((r) => r.clientCode);

  return (
    <CloverCustomersTable
      spec={SPEC}
      rows={result.items}
      total={result.total}
      page={page.page}
      size={page.size}
      sort={sort}
      showClient={showClient}
    />
  );
}
