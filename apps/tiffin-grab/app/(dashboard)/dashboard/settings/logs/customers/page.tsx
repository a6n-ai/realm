import { Suspense } from "react";
import { SectionCard, parseFilterState } from "@/components/ds";
import { requireAdmin } from "@/lib/auth/guards";
import { CUSTOMER_ACTIVITY_FACETS } from "@/lib/customer-activity/log-facets";
import { parseSort } from "@/lib/list/sort";
import {
  listCustomerActivitiesPage,
  type CustomerActivitySortColumn,
} from "@/lib/services/customer-activities-list.service";
import { CustomerLogsTable, CustomerLogsTableSkeleton } from "./customer-logs-table";

type SearchParams = Promise<Record<string, string | undefined>>;

const SORT_COLUMNS = ["time"] as const satisfies readonly CustomerActivitySortColumn[];

export default function CustomerLogsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <SectionCard
      title="Customer activity"
      subtitle="Saved changes to customers, by the customer, staff or the system. Browsing and unsaved changes are excluded."
    >
      <Suspense fallback={<CustomerLogsTableSkeleton />}>
        <CustomerLogsData searchParams={searchParams} />
      </Suspense>
    </SectionCard>
  );
}

async function CustomerLogsData({ searchParams }: { searchParams: SearchParams }) {
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
