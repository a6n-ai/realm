import { requirePagePermission } from "@/lib/auth/guards";
import { Suspense } from "react";
import { SectionCard, parseFilterState } from "@/components/ds";
import { Can, NoAccessNote } from "@/components/auth/can";
import { CUSTOMER_ACTIVITY_FACETS } from "@/lib/customer-activity/log-facets";
import { parseSort } from "@foundry/design-system/list-sort";
import {
  listCustomerActivitiesPage,
  type CustomerActivitySortColumn,
} from "@/lib/customer-activity/customer-activities-list.service";
import { CustomerLogsTable, CustomerLogsTableSkeleton } from "./customer-logs-table";

type SearchParams = Promise<Record<string, string | undefined>>;

const SORT_COLUMNS = ["time"] as const satisfies readonly CustomerActivitySortColumn[];

export default async function CustomerLogsPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePagePermission({ settings: ["read"] });
  return (
    <Can perms={{ customer: ["read"] }} fallback={<NoAccessNote />}>
      <SectionCard
        title="Customer activity"
        subtitle="Address changes, meal picks, holds, reschedules, and other saved customer actions — by the customer, admin, or system."
      >
        <Suspense fallback={<CustomerLogsTableSkeleton />}>
          <CustomerLogsData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </Can>
  );
}

async function CustomerLogsData({ searchParams }: { searchParams: SearchParams }) {
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
