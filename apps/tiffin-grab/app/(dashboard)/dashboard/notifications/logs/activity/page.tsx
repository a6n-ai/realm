import { Suspense } from "react";
import { SectionCard, parseFilterState } from "@/components/ds";
import { requireAdmin } from "@/lib/auth/guards";
import { CUSTOMER_ACTIVITY_FACETS } from "@/lib/customer-activity/log-facets";
import { parseSort } from "@/lib/list/sort";
import {
  listCustomerActivitiesPage,
  type CustomerActivitySortColumn,
} from "@/lib/services/customer-activities-list.service";
import {
  CustomerLogsTable,
  CustomerLogsTableSkeleton,
} from "@/app/(dashboard)/dashboard/settings/logs/customers/customer-logs-table";

type SearchParams = Promise<Record<string, string | undefined>>;

const SORT_COLUMNS = ["time"] as const satisfies readonly CustomerActivitySortColumn[];

export default function NotificationActivityLogsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <SectionCard
      title="Customer activity"
      subtitle="Address changes, meal picks, holds, reschedules, and other saved customer actions — by the customer, admin, or system."
    >
      <Suspense fallback={<CustomerLogsTableSkeleton />}>
        <ActivityData searchParams={searchParams} />
      </Suspense>
    </SectionCard>
  );
}

async function ActivityData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const params = await searchParams;
  const sort = parseSort(params, SORT_COLUMNS, { column: "time", dir: "desc" });
  const { condition, page } = parseFilterState(CUSTOMER_ACTIVITY_FACETS, params);
  const result = await listCustomerActivitiesPage(condition, page, sort);

  return (
    <CustomerLogsTable
      rows={result.items}
      total={result.total}
      page={page.page}
      size={page.size}
      sort={sort}
    />
  );
}
