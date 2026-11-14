import { createRateLimiter, drainPending as drain, sendScheduledCampaign } from "@relay/engine";
import { createLogger } from "@foundry/commons/logger";
import { db } from "@/db/client";
import { notifySendRate } from "@/lib/runtime/env";
import { notificationTables } from "./tables";
import { buildAppHandlers } from "./handlers";
import { campaignConfig } from "./campaign-config";
import { dueScheduledCampaignIds } from "./campaign-schedule";
import { campaignDeps } from "@/lib/notifications/deps";

const log = createLogger("campaign-schedule-send");

export async function drainPending(limit = 25, maxBatches = 20): Promise<number> {
  return drain(
    {
      db,
      tables: notificationTables,
      handlers: await buildAppHandlers(),
      rateLimiter: createRateLimiter(notifySendRate()),
      // A transient failure stays pending so the Queue retry re-sends it; a permanent one ends failed.
      maxAttempts: 3,
    },
    limit,
    maxBatches,
  );
}

export async function materializeDue(): Promise<number> {
  const due = await dueScheduledCampaignIds();
  let queued = 0;
  for (const publicId of due) {
    // Re-checked at send time: a scheduled campaign stays editable, and may have been unscheduled a moment ago.
    const r = await sendScheduledCampaign(
      campaignDeps,
      publicId,
      { footerConfigured: !!(await campaignConfig()) },
    );
    if (r.blocked) log.warn({ publicId, blocked: r.blocked.map((b) => b.code) }, "scheduled campaign failed its checklist; returned to draft");
    queued += r.queued;
  }
  return queued;
}
