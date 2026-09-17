import { Suspense } from "react";
import { SectionCard } from "@/components/ds";
import { loadNotificationLogs, LOGS_SPEC } from "@/lib/notifications/logs-query";
import { LogsTable, LogsTableSkeleton } from "./logs-table";

type SearchParams = Promise<Record<string, string | undefined>>;

export default function NotificationLogsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <SectionCard title="Notification log" subtitle="Every event-driven send, newest first.">
      <Suspense fallback={<LogsTableSkeleton />}>
        <LogsData searchParams={searchParams} />
      </Suspense>
    </SectionCard>
  );
}

async function LogsData({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { rows, sort, total, page, size } = await loadNotificationLogs(sp);
  return <LogsTable spec={LOGS_SPEC} rows={rows} sort={sort} total={total} page={page} size={size} />;
}
