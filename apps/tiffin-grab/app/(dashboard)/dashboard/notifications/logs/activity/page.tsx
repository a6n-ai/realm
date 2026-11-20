import { requirePagePermission } from "@/lib/auth/guards";
import { Suspense } from "react";
import { parseFilterState } from "@/components/ds";
import { ActivityCard } from "../log-cards";
import { CUSTOMER_ACTIVITY_FACETS } from "@/lib/customer-activity/log-facets";
import { parseSort } from "@foundry/design-system/list-sort";
import { withListDates } from "@/lib/list/default-month";
import {
  listCustomerActivitiesPage,
  type CustomerActivitySortColumn,
} from "@/lib/customer-activity/customer-activities-list.service";
import {
  CustomerLogsTable,
  CustomerLogsTableSkeleton,
} from "@/app/(dashboard)/dashboard/settings/logs/customers/customer-logs-table";

type SearchParams = Promise<Record<string, string | undefined>>;

const SORT_COLUMNS = ["time"] as const satisfies readonly CustomerActivitySortColumn[];

export default async function NotificationActivityLogsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requirePagePermission({ notification: ["read"] });
  return (
    <ActivityCard>
      <Suspense fallback={<CustomerLogsTableSkeleton />}>
        <ActivityData searchParams={searchParams} />
      </Suspense>
    </ActivityCard>
  );
}

async function ActivityData({ searchParams }: { searchParams: SearchParams }) {
  const params = await withListDates(await searchParams);
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
      hideDate
    />
  );
}
