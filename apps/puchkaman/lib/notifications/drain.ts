import {
  createRateLimiter,
  drainPending as drain,
  buildCampaignConfig,
  dueCampaigns,
  sendScheduledCampaign,
} from "@relay/engine";
import { createLogger } from "@foundry/commons/logger";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "./tables";
import { buildAppHandlers } from "./handlers";
import { resolveSegment } from "@/lib/campaigns/segment";

// SES MaxSendRate on this account is 14/s and is shared with tiffin-grab, so
// each app stays well under it — throttling damages sender reputation.
const SEND_RATE = Number(process.env.NOTIFY_SEND_RATE ?? 5);

const log = createLogger("campaign-schedule-send");

export async function drainPending(limit = 25, maxBatches = 20): Promise<number> {
  return drain(
    {
      db,
      tables: notificationTables,
      handlers: await buildAppHandlers(),
      rateLimiter: createRateLimiter(SEND_RATE),
      // Send once. A failed campaign row is retried by staff (Retry failed); a
      // failed code by the customer pressing resend.
      maxAttempts: 1,
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
    // Re-checked at send time: a scheduled campaign stays editable, and may have been unscheduled a moment ago.
    const r = await sendScheduledCampaign(
      { db, tables: notificationTables, users: usersRef, resolveSegment },
      publicId,
      { footerConfigured: !!buildCampaignConfig(notificationTables, process.env, { senderName: "Puchkaman" }) },
    );
    if (r.blocked) log.warn({ publicId, blocked: r.blocked.map((b) => b.code) }, "scheduled campaign failed its checklist; returned to draft");
    queued += r.queued;
  }
  return queued;
}
