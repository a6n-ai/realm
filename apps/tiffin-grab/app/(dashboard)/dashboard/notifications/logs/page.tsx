import { Suspense } from "react";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { conditionToSql, columnResolver } from "@foundry/database";
import { db } from "@/db/client";
import { notificationOutbox, users, messageSuppression } from "@/db/schema";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { parseSort, type SortState } from "@/lib/list/sort";
import { parseFilterState, type FacetDef, SectionCard } from "@/components/ds";
import {
  eventLabel,
  SuppressedAddressesTable,
  SuppressedAddressesTableSkeleton,
  type SuppressionRow,
} from "@relay/engine/ui";
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
  // "email" is the linked user's address; "recipientEmail" is the literal
  // address on the outbox row — a campaign/imported-contact send has no user
  // row at all, so only the latter is set. Both are searched so this box
  // finds a recipient regardless of which kind of send it was.
  { kind: "search", fields: ["email", "recipientEmail", "lastError", "providerMessageId"] },
];

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function NotificationLogsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  return (
    <div className="space-y-6">
      <SectionCard
        title="Notification log"
        subtitle={sp.campaignId ? "Filtered to one campaign's sends." : "Every event-driven send, newest first."}
      >
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

  const facetWhere = conditionToSql(
    condition,
    columnResolver({
      status: notificationOutbox.status,
      channel: notificationOutbox.channel,
      event: notificationOutbox.event,
      createdAt: notificationOutbox.createdAt,
      email: users.email,
      recipientEmail: notificationOutbox.recipientEmail,
      lastError: notificationOutbox.lastError,
      providerMessageId: notificationOutbox.providerMessageId,
    }),
  );
  // Deep-link from a campaign's detail page ("View logs") — not a facet pill,
  // just a plain id filter carried in the URL.
  const campaignId = sp.campaignId && /^\d+$/.test(sp.campaignId) ? BigInt(sp.campaignId) : undefined;
  const where = campaignId
    ? and(facetWhere, eq(notificationOutbox.campaignId, campaignId))
    : facetWhere;

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
  const { timezone } = await getAppSettings();
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
  return <SuppressedAddressesTable rows={rows} timeZone={timezone} />;
}

export type { LogSortColumn };
