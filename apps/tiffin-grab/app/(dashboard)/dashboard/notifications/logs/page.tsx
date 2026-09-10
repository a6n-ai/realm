import { Suspense } from "react";
import { asc, count, desc, eq, sql } from "drizzle-orm";
import { conditionToSql, columnResolver } from "@foundry/database";
import { db } from "@/db/client";
import { notificationOutbox, users, emailLog, messageSuppression } from "@/db/schema";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { parseSort, type SortState } from "@/lib/list/sort";
import { parseFilterState, type FacetDef, SectionCard } from "@/components/ds";
import { eventLabel } from "@relay/engine/ui";
import { LogsTable, LogsTableSkeleton } from "./logs-table";
import { RawEmailLogTable, RawEmailLogTableSkeleton, type EmailRow } from "./raw-email-log-table";

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

// Events that land in the outbox. Labels match eventLabel() so chips read like
// the Event column.
const EVENT_OPTIONS = [
  "order_created",
  "order_activated",
  "order_completed",
  "order_cancelled",
  "order_paused",
  "payment_received",
  "refund_issued",
  "menu_released",
  "wallet_credited",
  "wallet_redeemed",
  "inquiry_created",
  "inquiry_follow_up",
  "inquiry_converted",
  "ticket_created",
  "ticket_reply",
  "ticket_resolved",
  "signup",
  "manual_adjustment",
].map((value) => ({ value, label: eventLabel(value) }));

const SPEC: FacetDef[] = [
  {
    kind: "pills",
    field: "status",
    label: "Status",
    options: [...STATUS_OPTIONS],
  },
  {
    kind: "select",
    field: "channel",
    label: "Channel",
    options: [...CHANNEL_OPTIONS],
  },
  {
    kind: "select",
    field: "event",
    label: "Event",
    options: EVENT_OPTIONS,
  },
  { kind: "dateRange", field: "createdAt", label: "Time" },
  // Recipient + error/provider id. Enum columns use the facets above.
  { kind: "search", fields: ["email", "lastError", "providerMessageId"] },
];

type SearchParams = Promise<Record<string, string | undefined>>;

type ActivityRow = { at: number; recipient: string | null; subject: string; status: string; error: string | null };

export default function NotificationLogsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <SectionCard title="Notification log" subtitle="Every event-driven send, newest first.">
        <Suspense fallback={<LogsTableSkeleton />}>
          <LogsData searchParams={searchParams} />
        </Suspense>
      </SectionCard>

      <SectionCard
        title="Raw email log"
        subtitle="SES-level sends and suppressed addresses — auth/security mail and anything else outside the event pipeline."
      >
        <Suspense fallback={<RawEmailLogSkeleton />}>
          <RawEmailLogData />
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

async function RawEmailLogData() {
  const { timezone } = await getAppSettings();
  const base = sql`(
    select el.created_at as at, el.recipient, el.subject, el.status::text as status, el.error
    from ${emailLog} el
    union all
    select ms.created_at as at, ms.address as recipient,
           ms.reason as subject, 'suppressed' as status, null as error
    from ${messageSuppression} ms
    where ms.channel = 'email'
  ) t`;
  const items = await db.execute(sql`select at, recipient, subject, status, error from ${base} order by at desc limit 50`);
  const rows: EmailRow[] = (items as unknown as ActivityRow[]).map((r) => ({ ...r, at: Number(r.at) }));
  return <RawEmailLogTable rows={rows} timeZone={timezone} />;
}

function RawEmailLogSkeleton() {
  return <RawEmailLogTableSkeleton />;
}

export type { LogSortColumn };
