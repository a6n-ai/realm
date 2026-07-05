import { Suspense } from "react";
import { asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationOutbox, users } from "@/db/schema";
import { parseSort, type SortState } from "@/lib/list/sort";
import { LogsTable, LogsTableSkeleton } from "./logs-table";

const SORT_COL = {
  time: notificationOutbox.createdAt,
  event: notificationOutbox.event,
  channel: notificationOutbox.channel,
  recipient: users.email,
  status: notificationOutbox.status,
} as const;

type LogSortColumn = keyof typeof SORT_COL;

type SearchParams = Promise<{ sort?: string; dir?: string; q?: string }>;

export default function NotificationLogsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<LogsTableSkeleton />}>
      <LogsData searchParams={searchParams} />
    </Suspense>
  );
}

async function LogsData({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;

  const sort: SortState<LogSortColumn> = parseSort(
    sp,
    ["time", "event", "channel", "recipient", "status"],
    { column: "time", dir: "desc" },
  );

  const q = sp.q?.trim();
  const like = q ? `%${q}%` : null;
  const where = like
    ? or(
        ilike(users.email, like),
        ilike(notificationOutbox.lastError, like),
        ilike(notificationOutbox.providerMessageId, like),
        sql`${notificationOutbox.event}::text ilike ${like}`,
        sql`${notificationOutbox.channel}::text ilike ${like}`,
        sql`${notificationOutbox.status}::text ilike ${like}`,
      )
    : undefined;

  const col = SORT_COL[sort.column];
  const orderBy = sort.dir === "asc" ? asc(col) : desc(col);

  const rows = await db
    .select({
      publicId: notificationOutbox.publicId,
      event: notificationOutbox.event,
      channel: notificationOutbox.channel,
      status: notificationOutbox.status,
      attempts: notificationOutbox.attempts,
      providerMessageId: notificationOutbox.providerMessageId,
      lastError: notificationOutbox.lastError,
      createdAt: notificationOutbox.createdAt,
      email: users.email,
    })
    .from(notificationOutbox)
    .leftJoin(users, eq(users.id, notificationOutbox.recipientId))
    .where(where)
    .orderBy(orderBy)
    .limit(100);

  return <LogsTable rows={rows} sort={sort} />;
}

export type { LogSortColumn };
