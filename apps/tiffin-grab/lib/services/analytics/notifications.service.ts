import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationOutbox } from "@/db/schema";

export type NotificationBuckets = { total: number; sent: number; skipped: number; failed: number; inFlight: number };

const skipped = sql`${notificationOutbox.status} = 'sent' and ${notificationOutbox.lastError} like 'skipped%'`;

/**
 * Every outbox row falls in exactly one bucket, so sent + skipped + failed + inFlight = total.
 * A row sent with a non-"skipped" last_error (a retried send) is still Delivered.
 */
export async function getNotificationBuckets(created?: SQL): Promise<NotificationBuckets> {
  const [row] = await db
    .select({
      total: sql<number>`cast(count(*) as int)`,
      sent: sql<number>`cast(count(*) filter (where ${notificationOutbox.status} = 'sent' and not coalesce(${notificationOutbox.lastError} like 'skipped%', false)) as int)`,
      skipped: sql<number>`cast(count(*) filter (where ${skipped}) as int)`,
      failed: sql<number>`cast(count(*) filter (where ${notificationOutbox.status} = 'failed') as int)`,
      inFlight: sql<number>`cast(count(*) filter (where ${notificationOutbox.status} not in ('sent', 'failed')) as int)`,
    })
    .from(notificationOutbox)
    .where(created);
  return row;
}
