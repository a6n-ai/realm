import { sql, type SQL } from "drizzle-orm";
import { notificationOutbox } from "@/db/schema";

/** Same four buckets as the notification analytics cards. Delivered and skipped are both status `sent`. */
export const NOTIFICATION_OUTCOMES = ["delivered", "skipped", "failed", "inflight"] as const;
export type NotificationOutcome = (typeof NOTIFICATION_OUTCOMES)[number];

const skipped = sql`${notificationOutbox.status} = 'sent' and ${notificationOutbox.lastError} like 'skipped%'`;

export function notificationOutcomeWhere(outcome: NotificationOutcome): SQL {
  switch (outcome) {
    case "delivered":
      return sql`${notificationOutbox.status} = 'sent' and not coalesce(${notificationOutbox.lastError} like 'skipped%', false)`;
    case "skipped":
      return skipped;
    case "failed":
      return sql`${notificationOutbox.status} = 'failed'`;
    case "inflight":
      return sql`${notificationOutbox.status} not in ('sent', 'failed')`;
    default: {
      const unreachable: never = outcome;
      return unreachable;
    }
  }
}

export function parseNotificationOutcome(value: string | undefined): NotificationOutcome | null {
  return NOTIFICATION_OUTCOMES.find((o) => o === value) ?? null;
}

export function notificationLogsHref(
  sp: { from?: string; to?: string },
  outcome?: NotificationOutcome,
): string {
  const qs = new URLSearchParams();
  if (sp.from) qs.set("from", sp.from);
  if (sp.to) qs.set("to", sp.to);
  if (outcome) qs.set("outcome", outcome);
  const s = qs.toString();
  return s ? `/dashboard/notifications/logs?${s}` : "/dashboard/notifications/logs";
}
