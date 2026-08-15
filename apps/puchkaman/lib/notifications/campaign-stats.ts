import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { campaign, notificationOutbox } from "@/db/schema";

/**
 * Attribute an SES event to its campaign via the provider message id stamped on
 * the outbox row when it was sent. A transactional send has no campaign_id, so
 * its events fall through as a no-op — the email_log row is its record.
 */
export async function recordCampaignEvent(providerMessageId: string, type: string): Promise<void> {
  const [row] = await db
    .select({ campaignId: notificationOutbox.campaignId })
    .from(notificationOutbox)
    .where(eq(notificationOutbox.providerMessageId, providerMessageId))
    .limit(1);
  if (!row?.campaignId) return;

  await db
    .update(campaign)
    // jsonb_set with a coalesced default so the first event of a type creates it.
    .set({
      counts: sql`jsonb_set(${campaign.counts}, ARRAY[${type}],
        to_jsonb(COALESCE((${campaign.counts} ->> ${type})::int, 0) + 1))`,
    })
    .where(eq(campaign.id, row.campaignId));
}
