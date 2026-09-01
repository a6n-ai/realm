import { Suspense } from "react";
import { ShoppingBagIcon, UserPlusIcon, UsersIcon, UserCheckIcon } from "lucide-react";
import { formatMoney } from "@foundry/commons";
import { getCloverConnection } from "@foundry/clover";
import {
  PageHeader,
  PageShell,
  SectionCard,
  StatGrid,
  parseFilterState,
  type FacetDef,
} from "@foundry/design-system";
import { Skeleton } from "@foundry/ui/skeleton";
import { requirePermission } from "@/lib/auth/guards";
import { parseSort } from "@/lib/list/sort";
import { PushCustomersToCloverButton } from "@/components/admin/push-customers-to-clover-button";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import {
  customerStats,
  listCustomersPage,
  type CustomerSortColumn,
} from "@/lib/services/customers.service";
import { CustomersTable, CustomersTableSkeleton } from "./customers-table";

type SearchParams = Promise<Record<string, string | undefined>>;

/** Same locale/zone pair the rest of the app formats with (checkout, tracking). */
const shopDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Toronto" });

const SORT_COLUMNS = [
  "name",
  "email",
  "joined",
  "orders",
  "spent",
  "lastOrder",
] as const satisfies readonly CustomerSortColumn[];

const SPEC: FacetDef[] = [
  {
    kind: "pills",
    field: "status",
    label: "Status",
    options: [
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
      { value: "suspended", label: "Suspended" },
    ],
  },
  { kind: "dateRange", field: "createdAt", label: "Joined" },
  { kind: "search", fields: ["name", "email", "phone"] },
];

export default function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <PageHeader
        icon={UsersIcon}
        title="Customers"
        subtitle="People who order and can sign in to their own account."
        actions={
          <Suspense fallback={null}>
            <HeaderActions />
          </Suspense>
        }
      />
      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        <CustomersStats />
      </Suspense>
      <SectionCard title="All customers">
        <Suspense fallback={<CustomersTableSkeleton />}>
          <CustomersData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function HeaderActions() {
  await requirePermission({ user: ["list"] });
  const clover = await getCloverConnection(integrationsConfigStore);
  return <PushCustomersToCloverButton cloverConnected={Boolean(clover.connected && clover.merchantId)} />;
}

async function CustomersStats() {
  await requirePermission({ user: ["list"] });
  const s = await customerStats();

  return (
    <StatGrid
      cols={4}
      items={[
        { label: "Total customers", value: String(s.total), icon: UsersIcon },
        { label: "Active", value: String(s.active), icon: UserCheckIcon },
        { label: "With orders", value: String(s.withOrders), icon: ShoppingBagIcon },
        { label: "New this week", value: String(s.newThisWeek), icon: UserPlusIcon },
      ]}
    />
  );
}

async function CustomersData({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission({ user: ["list"] });

  const sp = await searchParams;
  const sort = parseSort(sp, SORT_COLUMNS, { column: "joined", dir: "desc" });
  const { condition, page } = parseFilterState(SPEC, sp);

  const result = await listCustomersPage(condition, page, sort);

  return (
    <CustomersTable
      spec={SPEC}
      rows={result.items.map((r) => ({
        ...r,
        spentLabel: formatMoney(Number(r.totalSpent)),
        // Formatted here, not in the table: a bare toLocaleDateString() renders
        // in the server's locale/zone and again in the browser's, which is a
        // hydration mismatch (and a wrong date for anyone outside the shop's
        // timezone). The store is in Toronto, so that is the operator's day.
        joinedLabel: shopDate(Number(r.createdAt)),
        lastOrderLabel: r.lastOrderAt ? shopDate(Number(r.lastOrderAt)) : "—",
      }))}
      total={result.total}
      page={page.page}
      size={page.size}
      sort={sort}
    />
  );
}
