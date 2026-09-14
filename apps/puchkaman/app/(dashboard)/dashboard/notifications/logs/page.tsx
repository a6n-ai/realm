import { Suspense } from "react";
import { asc, count, desc, eq } from "drizzle-orm";
import { columnResolver, conditionToSql } from "@foundry/database";
import { parseFilterState, SectionCard, type FacetDef } from "@foundry/design-system";
import {
  eventLabel,
  SuppressedAddressesTable,
  SuppressedAddressesTableSkeleton,
  type SuppressionRow,
} from "@relay/engine/ui";
import { db } from "@/db/client";
import { appEvent, notificationOutbox, users, messageSuppression } from "@/db/schema";
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

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "sent", label: "Sent" },
  { value: "failed", label: "Failed" },
] as const;

const CHANNEL_OPTIONS = [
  { value: "email", label: "Email" },
  { value: "in_app", label: "In-app" },
  { value: "sms", label: "SMS" },
  { value: "whatsapp", label: "WhatsApp" },
] as const;

// Derived from the enum rather than hand-listed, so a new event cannot be added
// without appearing here. Labels match eventLabel() so chips read like the
// Event column.
const EVENT_OPTIONS = appEvent.enumValues.map((value) => ({ value, label: eventLabel(value) }));

const SPEC: FacetDef[] = [
  { kind: "pills", field: "status", label: "Status", options: [...STATUS_OPTIONS] },
  { kind: "select", field: "channel", label: "Channel", options: [...CHANNEL_OPTIONS] },
  { kind: "select", field: "event", label: "Event", options: EVENT_OPTIONS },
  { kind: "dateRange", field: "createdAt", label: "Time" },
  // Recipient + error/provider id. Enum columns use the facets above.
  { kind: "search", fields: ["email", "lastError", "providerMessageId"] },
];

type SearchParams = Promise<Record<string, string | undefined>>;

export default function NotificationLogsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <SectionCard title="Notification log" subtitle="Every event-driven send, newest first.">
        <Suspense fallback={<LogsTableSkeleton />}>
          <LogsData searchParams={searchParams} />
        </Suspense>
      </SectionCard>

      <SectionCard
        title="Suppressed addresses"
        subtitle="Bounced, complained or unsubscribed addresses — no send is attempted against these until cleared."
      >
        <Suspense fallback={<SuppressedAddressesTableSkeleton />}>
          <SuppressedAddressesData />
        </Suspense>
      </SectionCard>
    </div>
  );
}

async function LogsData({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;

  const sort: SortState<LogSortColumn> = parseSort(
    sp,
    ["time", "event", "channel", "recipient", "status"],
    { column: "time", dir: "desc" },
  );

  const { condition, page } = parseFilterState(SPEC, sp);

  const where = conditionToSql(
    condition,
    columnResolver({
      status: notificationOutbox.status,
      channel: notificationOutbox.channel,
      event: notificationOutbox.event,
      createdAt: notificationOutbox.createdAt,
      email: users.email,
      lastError: notificationOutbox.lastError,
      providerMessageId: notificationOutbox.providerMessageId,
    }),
  );

  const col = SORT_COL[sort.column];
  const orderBy = sort.dir === "asc" ? asc(col) : desc(col);

  const [rows, [totalRow]] = await Promise.all([
    db
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
        recipientEmail: notificationOutbox.recipientEmail,
      })
      .from(notificationOutbox)
      .leftJoin(users, eq(users.id, notificationOutbox.recipientId))
      .where(where)
      .orderBy(orderBy)
      .limit(page.size)
      .offset(page.page * page.size),
    db
      .select({ n: count() })
      .from(notificationOutbox)
      .leftJoin(users, eq(users.id, notificationOutbox.recipientId))
      .where(where),
  ]);

  return (
    <LogsTable
      spec={SPEC}
      rows={rows}
      sort={sort}
      total={Number(totalRow?.n ?? 0)}
      page={page.page}
      size={page.size}
    />
  );
}

async function SuppressedAddressesData() {
  const items = await db
    .select({
      at: messageSuppression.createdAt,
      address: messageSuppression.address,
      scope: messageSuppression.scope,
      reason: messageSuppression.reason,
    })
    .from(messageSuppression)
    .where(eq(messageSuppression.channel, "email"))
    .orderBy(desc(messageSuppression.createdAt))
    .limit(50);
  const rows: SuppressionRow[] = items.map((r) => ({ ...r, at: Number(r.at) }));
  return <SuppressedAddressesTable rows={rows} />;
}

export type { LogSortColumn };
