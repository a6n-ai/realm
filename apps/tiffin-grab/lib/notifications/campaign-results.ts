import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { campaign } from "@/db/schema";
import { cloudWatchSesMetrics, type CampaignTotals, type EmailMetricsProvider } from "@relay/email";

const DAY_S = 86_400;

/**
 * Never lower a count: campaigns sent before tagging (or counted by the old
 * per-event webhook) have webhook totals CloudWatch never saw.
 */
export function mergeCounts(current: Record<string, number>, fresh: CampaignTotals): Record<string, number> {
  const next = { ...current };
  for (const [k, v] of Object.entries(fresh)) next[k] = Math.max(current[k] ?? 0, v ?? 0);
  return next;
}

/** SES campaign Delivery/Open/Click totals are pulled on demand into campaign.counts. */
export async function refreshCampaignResults(
  publicId: string,
  metrics: EmailMetricsProvider = cloudWatchSesMetrics({ region: process.env.AWS_REGION }),
): Promise<{ counts: Record<string, number> } | null> {
  const [row] = await db
    .select({ id: campaign.id, sentAt: campaign.sentAt, counts: campaign.counts })
    .from(campaign)
    .where(eq(campaign.publicId, publicId));
  if (!row) return null;
  const current = (row.counts ?? {}) as Record<string, number>;
  if (row.sentAt == null) return { counts: current };

  // Day buckets from the day before the send: opens keep trickling in for weeks.
  const start = new Date((Math.floor(Number(row.sentAt) / 1000 / DAY_S) - 1) * DAY_S * 1000);
  const fresh = await metrics.campaignTotals(String(row.id), { start, end: new Date() });
  const counts = mergeCounts(current, fresh);
  const patch = Object.fromEntries((["delivered", "opened", "clicked"] as const).filter((k) => k in counts).map((k) => [k, counts[k]]));
  // Only the CloudWatch keys: a webhook bounce/complaint landing meanwhile is kept.
  await db
    .update(campaign)
    .set({ counts: sql`${campaign.counts} || ${JSON.stringify(patch)}::jsonb` })
    .where(eq(campaign.id, row.id));
  return { counts };
}
