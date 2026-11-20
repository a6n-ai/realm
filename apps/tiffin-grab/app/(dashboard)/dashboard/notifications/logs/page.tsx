import { requirePagePermission } from "@/lib/auth/guards";
import { Suspense } from "react";
import { SendsCard } from "./log-cards";
import { loadNotificationLogs, LOGS_SPEC } from "@/lib/notifications/logs-query";
import { LogsTable, LogsTableSkeleton } from "./logs-table";

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function NotificationLogsPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePagePermission({ notification: ["read"] });
  return (
    <SendsCard>
      <Suspense fallback={<LogsTableSkeleton />}>
        <LogsData searchParams={searchParams} />
      </Suspense>
    </SendsCard>
  );
}

async function LogsData({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { rows, sort, total, page, size } = await loadNotificationLogs(sp);
  return <LogsTable spec={LOGS_SPEC} rows={rows} sort={sort} total={total} page={page} size={size} />;
}
