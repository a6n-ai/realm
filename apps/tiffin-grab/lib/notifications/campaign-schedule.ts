import Redis from "ioredis";
import { and, eq, isNotNull } from "drizzle-orm";
import { createLogger } from "@foundry/commons/logger";
import { db } from "@/db/client";
import { notificationTables } from "./tables";

const log = createLogger("campaign-schedule");

// Scheduled campaigns waiting for their time, scored by send time (epoch ms). The DB row
// stays the record (dueCampaigns reads it); this set only lets the outbox listener ask
// Redis, not the database, "is anything due?" on each wake-up, so nothing polls the DB.
export const CAMPAIGN_SCHEDULE_KEY = "notify:campaigns:scheduled";

let writer: Redis | undefined;

/** Fire-and-forget: a lost add is repaired by the boot-time rebuild. */
export function addScheduledCampaign(publicId: string, sendAt: number): void {
  const url = process.env.REDIS_URL;
  if (!url) return;
  if (!writer) {
    writer = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
    writer.on("error", () => {});
  }
  writer.zadd(CAMPAIGN_SCHEDULE_KEY, sendAt, publicId).catch((err: unknown) => log.warn({ err }, "schedule add failed"));
}

/** Ids whose send time has come. */
export function dueScheduledIds(redis: Redis, now = Date.now()): Promise<string[]> {
  return redis.zrangebyscore(CAMPAIGN_SCHEDULE_KEY, "-inf", now);
}

export async function clearScheduledIds(redis: Redis, ids: string[]): Promise<void> {
  if (ids.length) await redis.zrem(CAMPAIGN_SCHEDULE_KEY, ...ids);
}

/** Boot: re-add every scheduled campaign from the DB, in case Redis lost the set. One query. */
export async function rebuildScheduledCampaigns(redis: Redis): Promise<number> {
  const rows = await db
    .select({ publicId: notificationTables.campaign.publicId, scheduledAt: notificationTables.campaign.scheduledAt })
    .from(notificationTables.campaign)
    .where(and(eq(notificationTables.campaign.status, "scheduled"), isNotNull(notificationTables.campaign.scheduledAt)));
  for (const r of rows) await redis.zadd(CAMPAIGN_SCHEDULE_KEY, Number(r.scheduledAt), String(r.publicId));
  return rows.length;
}
