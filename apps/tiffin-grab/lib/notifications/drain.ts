import { createRateLimiter, drainPending as drain, sendScheduledCampaign } from "@relay/engine";
import { createLogger } from "@foundry/commons/logger";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { relayOptOutRefusal } from "@/lib/relay/campaign-optout";
import { notifyFrom, notifySendRate } from "@/lib/runtime/env";
import { notificationTables } from "./tables";
import { buildAppHandlers } from "./handlers";
import { campaignConfig } from "./campaign-config";
import { dueScheduledCampaignIds } from "./campaign-schedule";
import { campaignDeps } from "@/lib/notifications/deps";

const log = createLogger("campaign-schedule-send");

async function userEmail(id: bigint) {
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, id));
  return u?.email ?? null;
}

export async function drainPending(limit = 25, maxBatches = 20): Promise<number> {
  // Relay checks brand opt-outs only when told the sender.
  const from = (await campaignConfig())?.sender.email ?? notifyFrom().email;
  return drain(
    {
      db,
      tables: notificationTables,
      handlers: await buildAppHandlers(),
      rateLimiter: createRateLimiter(notifySendRate()),
      // A transient failure stays pending so the Queue retry re-sends it; a permanent one ends failed.
      maxAttempts: 3,
      beforeSend: (row) => relayOptOutRefusal(row, from, userEmail),
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
