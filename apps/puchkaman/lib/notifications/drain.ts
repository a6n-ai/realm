import {
  createRateLimiter,
  drainPending as drain,
  dueCampaigns,
  materializeCampaign,
} from "@realm/notifications";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "./tables";
import { buildAppHandlers } from "./handlers";
import { resolveSegment } from "@/lib/campaigns/segment";

// SES MaxSendRate on this account is 14/s and is shared with tiffin-grab, so
// each app stays well under it — throttling damages sender reputation.
const SEND_RATE = Number(process.env.NOTIFY_SEND_RATE ?? 5);

export function drainPending(limit = 25, maxBatches = 20): Promise<number> {
  return drain(
    {
      db,
      tables: notificationTables,
      handlers: buildAppHandlers(),
      rateLimiter: createRateLimiter(SEND_RATE),
    },
    limit,
    maxBatches,
  );
}

/**
 * Expand any scheduled campaign whose time has come. Returns rows queued.
 * Separate from drainPending so the drainer can keep delivering even when a
 * campaign's segment query is broken.
 */
export async function materializeDue(): Promise<number> {
  const due = await dueCampaigns(db, notificationTables);
  let queued = 0;
  for (const publicId of due) {
    const r = await materializeCampaign(
      { db, tables: notificationTables, users: usersRef, resolveSegment },
      publicId,
    );
    queued += r.queued;
  }
  return queued;
}
