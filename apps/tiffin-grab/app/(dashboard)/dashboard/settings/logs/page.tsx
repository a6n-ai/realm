import { Suspense } from "react";
import { ScrollTextIcon } from "lucide-react";
import { PageHeader, SectionCard, parseFilterState } from "@/components/ds";
import { requireAdmin } from "@/lib/auth/guards";
import { SETTINGS_ACTIVITY_FACETS } from "@/lib/order-activity/log-facets";
import { parseSort } from "@/lib/list/sort";
import {
  listOrderActivitiesPage,
  type ActivitySortColumn,
} from "@/lib/services/order-activities-list.service";
import { LogsTable, LogsTableSkeleton } from "./logs-table";

type SearchParams = Promise<Record<string, string | undefined>>;

const SORT_COLUMNS = [
  "time",
  "customer",
  "action",
  "actor",
] as const satisfies readonly ActivitySortColumn[];

export default function SettingsLogsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="grid gap-6">
      <PageHeader
        icon={ScrollTextIcon}
        title="Logs"
        subtitle="Customer and staff actions across subscriptions — who changed what, and when."
      />
      <SectionCard title="Activity">
        <Suspense fallback={<LogsTableSkeleton />}>
          <LogsData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </div>
  );
}

async function LogsData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();

  const sp = await searchParams;
  const sort = parseSort(sp, SORT_COLUMNS, { column: "time", dir: "desc" });
  const { condition, page } = parseFilterState(SETTINGS_ACTIVITY_FACETS, sp);
  const result = await listOrderActivitiesPage(condition, page, sort);

  return (
    <LogsTable
      rows={result.items}
      total={result.total}
      page={page.page}
      size={page.size}
      sort={sort}
    />
  );
}
