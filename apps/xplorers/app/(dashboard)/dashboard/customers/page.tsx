import { Suspense } from "react";
import { CalendarCheckIcon, UserCheckIcon, UserPlusIcon, UsersIcon } from "lucide-react";
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
import { formatAppDay } from "@/lib/app-clock";
import { parseSort } from "@/lib/list/sort";
import { getAppClock } from "@/lib/services/app-settings.service";
import { customerStats, listCustomersPage, type CustomerSortColumn } from "@/lib/services/customers.service";
import { CustomersList, CustomersListSkeleton } from "./customers-list";

type SearchParams = Promise<Record<string, string | undefined>>;

const SORT_COLUMNS = [
  "name",
  "email",
  "joined",
  "bookings",
  "spent",
  "lastBooking",
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
  { kind: "search", fields: ["name", "username", "email", "phone"] },
];

export default function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <PageHeader icon={UsersIcon} title="Customers" subtitle="People who book classes and sign in at /me." />
      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        <CustomersStats />
      </Suspense>
      <SectionCard title="All customers">
        <Suspense fallback={<CustomersListSkeleton />}>
          <CustomersData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
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
        { label: "With bookings", value: String(s.withBookings), icon: CalendarCheckIcon },
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
  const [{ timezone, currency }, result] = await Promise.all([getAppClock(), listCustomersPage(condition, page, sort)]);

  return (
    <CustomersList
      spec={SPEC}
      rows={result.items.map((r) => ({
        ...r,
        // Formatted on the server in the app timezone; formatting in the table
        // would render twice in two zones and mismatch on hydration.
        joinedLabel: formatAppDay(Number(r.createdAt), timezone),
        lastBookingLabel: r.lastBookingAt ? formatAppDay(r.lastBookingAt, timezone) : "—",
      }))}
      total={result.total}
      page={page.page}
      size={page.size}
      sort={sort}
      currency={currency}
    />
  );
}
