import { and, asc, count, desc, eq } from "drizzle-orm";
import { columnResolver, conditionToSql } from "@foundry/database";
import { parseFilterState, type FacetDef } from "@foundry/design-system";
import { eventLabel } from "@relay/engine/ui";
import { db } from "@/db/client";
import { appEvent, messageSuppression, notificationOutbox, users } from "@/db/schema";
import { parseSort, type SortState } from "@/lib/list/sort";
import type { LogSortColumn } from "@/app/(dashboard)/dashboard/notifications/logs/logs-table";
import type { SuppressedSortColumn } from "@/app/(dashboard)/dashboard/notifications/logs/suppressed-table";

const SORT_COL = {
  time: notificationOutbox.createdAt,
  event: notificationOutbox.event,
  channel: notificationOutbox.channel,
  recipient: users.email,
  status: notificationOutbox.status,
} as const;

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

/** Shared by the top-level Logs page and a campaign's own Logs tab, so both render the same table/filters. */
export const LOGS_SPEC: FacetDef[] = [
  { kind: "pills", field: "status", label: "Status", options: [...STATUS_OPTIONS] },
  { kind: "select", field: "channel", label: "Channel", options: [...CHANNEL_OPTIONS] },
  { kind: "select", field: "event", label: "Event", options: EVENT_OPTIONS },
  { kind: "dateRange", field: "createdAt", label: "Time" },
  // "email" is the linked user's address; "recipientEmail" is the literal
  // address on the outbox row — a campaign/imported-contact send has no user
  // row at all, so only the latter is set. Both are searched so this box
  // finds a recipient regardless of which kind of send it was.
  { kind: "search", fields: ["email", "recipientEmail", "lastError", "providerMessageId"] },
];

export interface NotificationLogRow {
  publicId: string;
  event: string | null;
  channel: string;
  status: string;
  attempts: number;
  providerMessageId: string | null;
  lastError: string | null;
  createdAt: number;
  email: string | null;
  recipientEmail: string | null;
}

/**
 * One query, two callers: the Notifications > Logs page (unfiltered, or
 * filtered by a plain `?campaignId=` deep link) and a campaign detail page's
 * own Logs tab (`campaignId` pinned, no deep-link param needed). Keeping this
 * in one place means both render identical columns/filters/pagination.
 */
export async function loadNotificationLogs(
  sp: Record<string, string | undefined>,
  opts: { campaignId?: bigint } = {},
): Promise<{ rows: NotificationLogRow[]; sort: SortState<LogSortColumn>; total: number; page: number; size: number }> {
  const sort: SortState<LogSortColumn> = parseSort(sp, ["time", "event", "channel", "recipient", "status"], {
    column: "time",
    dir: "desc",
  });

  const { condition, page } = parseFilterState(LOGS_SPEC, sp);

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
  // Deep-link from a campaign's detail page — not a facet pill, just a plain
  // id filter carried in the URL when this is the standalone Logs page.
  const linkedCampaignId =
    opts.campaignId ?? (sp.campaignId && /^\d+$/.test(sp.campaignId) ? BigInt(sp.campaignId) : undefined);
  const where = linkedCampaignId ? and(facetWhere, eq(notificationOutbox.campaignId, linkedCampaignId)) : facetWhere;

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

  return { rows, sort, total: Number(totalRow?.n ?? 0), page: page.page, size: page.size };
}

const SUPPRESSION_SORT_COL = {
  time: messageSuppression.createdAt,
  address: messageSuppression.address,
  channel: messageSuppression.channel,
  scope: messageSuppression.scope,
  reason: messageSuppression.reason,
} as const;

export const SUPPRESSED_SPEC: FacetDef[] = [
  {
    kind: "select",
    field: "scope",
    label: "Scope",
    options: [
      { value: "all", label: "All (bounce/complaint/STOP)" },
      { value: "marketing", label: "Marketing only (unsubscribe)" },
    ],
  },
  {
    kind: "select",
    field: "reason",
    label: "Reason",
    options: [
      { value: "bounce", label: "Bounce" },
      { value: "complaint", label: "Complaint" },
      { value: "unsubscribe", label: "Unsubscribe" },
      { value: "manual", label: "Manual" },
    ],
  },
  {
    kind: "select",
    field: "channel",
    label: "Channel",
    options: [
      { value: "email", label: "Email" },
      { value: "sms", label: "SMS" },
      { value: "whatsapp", label: "WhatsApp" },
    ],
  },
  { kind: "dateRange", field: "createdAt", label: "Time" },
  { kind: "search", fields: ["address"] },
];

export interface SuppressedAddressRow {
  publicId: string;
  address: string;
  channel: string;
  scope: string;
  reason: string;
  createdAt: number;
}

export async function loadSuppressedAddresses(
  sp: Record<string, string | undefined>,
): Promise<{ rows: SuppressedAddressRow[]; sort: SortState<SuppressedSortColumn>; total: number; page: number; size: number }> {
  const sort: SortState<SuppressedSortColumn> = parseSort(sp, ["time", "address", "channel", "scope", "reason"], {
    column: "time",
    dir: "desc",
  });

  const { condition, page } = parseFilterState(SUPPRESSED_SPEC, sp);
  const where = conditionToSql(
    condition,
    columnResolver({
      scope: messageSuppression.scope,
      reason: messageSuppression.reason,
      channel: messageSuppression.channel,
      createdAt: messageSuppression.createdAt,
      address: messageSuppression.address,
    }),
  );

  const col = SUPPRESSION_SORT_COL[sort.column];
  const orderBy = sort.dir === "asc" ? asc(col) : desc(col);

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        publicId: messageSuppression.publicId,
        address: messageSuppression.address,
        channel: messageSuppression.channel,
        scope: messageSuppression.scope,
        reason: messageSuppression.reason,
        createdAt: messageSuppression.createdAt,
      })
      .from(messageSuppression)
      .where(where)
      .orderBy(orderBy)
      .limit(page.size)
      .offset(page.page * page.size),
    db.select({ n: count() }).from(messageSuppression).where(where),
  ]);

  return { rows, sort, total: Number(totalRow?.n ?? 0), page: page.page, size: page.size };
}
