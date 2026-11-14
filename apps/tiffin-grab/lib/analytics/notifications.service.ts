import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationOutbox } from "@/db/schema";
import { notificationOutcomeWhere } from "@/lib/notifications/outcome";
import { intCount } from "./metrics/scope";

export type NotificationBuckets = { total: number; sent: number; skipped: number; failed: number; inFlight: number };

/**
 * Every outbox row falls in exactly one bucket, so sent + skipped + failed + inFlight = total.
 * A row sent with a non-"skipped" last_error (a retried send) is still Delivered.
 */
export async function getNotificationBuckets(created?: SQL): Promise<NotificationBuckets> {
  const [row] = await db
    .select({
      total: sql<number>`cast(count(*) as int)`,
      sent: sql<number>`cast(count(*) filter (where ${notificationOutcomeWhere("delivered")}) as int)`,
      skipped: sql<number>`cast(count(*) filter (where ${notificationOutcomeWhere("skipped")}) as int)`,
      failed: sql<number>`cast(count(*) filter (where ${notificationOutcomeWhere("failed")}) as int)`,
      inFlight: sql<number>`cast(count(*) filter (where ${notificationOutcomeWhere("inflight")}) as int)`,
    })
    .from(notificationOutbox)
    .where(created);
  return row;
}

export async function getChannelCounts(created?: SQL): Promise<{ channel: string; n: number }[]> {
  return db.select({ channel: notificationOutbox.channel, n: intCount }).from(notificationOutbox).where(created).groupBy(notificationOutbox.channel);
}

export async function getStatusCounts(created?: SQL): Promise<{ status: string; n: number }[]> {
  return db.select({ status: notificationOutbox.status, n: intCount }).from(notificationOutbox).where(created).groupBy(notificationOutbox.status);
}
