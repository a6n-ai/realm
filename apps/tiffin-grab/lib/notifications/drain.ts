import { createRateLimiter, drainPending as drain, dueCampaigns, sendScheduledCampaign } from "@relay/engine";
import { createLogger } from "@foundry/commons/logger";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "./tables";
import { buildAppHandlers } from "./handlers";
import { campaignConfig } from "./campaign-config";
import { resolveSegment } from "@/lib/campaigns/segment";

// SES MaxSendRate is 14/s on this account, shared with puchkaman (5/s); stay
// under it so a burst cannot trigger throttling, which damages sender reputation.
const SEND_RATE = Number(process.env.NOTIFY_SEND_RATE ?? 8);

const log = createLogger("campaign-schedule-send");

export async function drainPending(limit = 25, maxBatches = 20): Promise<number> {
  return drain(
    {
      db,
      tables: notificationTables,
      handlers: await buildAppHandlers(),
      rateLimiter: createRateLimiter(SEND_RATE),
      // Send once. A failed campaign row is retried by staff (Retry failed); a
      // failed OTP by the customer pressing resend.
      maxAttempts: 1,
    },
    limit,
    maxBatches,
  );
}

/** Expand any scheduled campaign whose time has come. Returns rows queued. */
export async function materializeDue(): Promise<number> {
  const due = await dueCampaigns(db, notificationTables);
  let queued = 0;
  for (const publicId of due) {
    // Re-checked at send time: a scheduled campaign stays editable, and may have been unscheduled a moment ago.
    const r = await sendScheduledCampaign(
      { db, tables: notificationTables, users: usersRef, resolveSegment },
      publicId,
      { footerConfigured: !!(await campaignConfig()) },
    );
    if (r.blocked) log.warn({ publicId, blocked: r.blocked.map((b) => b.code) }, "scheduled campaign failed its checklist; returned to draft");
    queued += r.queued;
  }
  return queued;
}
