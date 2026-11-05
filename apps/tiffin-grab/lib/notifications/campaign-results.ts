import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { campaign } from "@/db/schema";

/**
 * SES counts campaign Delivery/Open/Click into CloudWatch (namespace AWS/SES,
 * dimension `campaign` = the id the engine tags each send with) instead of a
 * webhook per event. This pulls those totals into campaign.counts on demand.
 */
const METRICS = { Delivery: "delivered", Open: "opened", Click: "clicked" } as const;
const DAY_S = 86_400;

export type CampaignTotals = Partial<Record<(typeof METRICS)[keyof typeof METRICS], number>>;

/** Sum each metric's daily datapoints into totals. Pure, for tests. */
export function sumMetricResults(results: { Id?: string; Values?: number[] }[]): CampaignTotals {
  const out: CampaignTotals = {};
  for (const r of results) {
    const key = Object.values(METRICS).find((k) => k === r.Id);
    if (key) out[key] = (r.Values ?? []).reduce((s, v) => s + v, 0);
  }
  return out;
}

/**
 * Never lower a count: campaigns sent before tagging (or counted by the old
 * per-event webhook) have webhook totals CloudWatch never saw.
 */
export function mergeCounts(current: Record<string, number>, fresh: CampaignTotals): Record<string, number> {
  const next = { ...current };
  for (const [k, v] of Object.entries(fresh)) next[k] = Math.max(current[k] ?? 0, v ?? 0);
  return next;
}

export async function refreshCampaignResults(publicId: string): Promise<{ counts: Record<string, number> } | null> {
  const [row] = await db
    .select({ id: campaign.id, sentAt: campaign.sentAt, counts: campaign.counts })
    .from(campaign)
    .where(eq(campaign.publicId, publicId));
  if (!row) return null;
  const current = (row.counts ?? {}) as Record<string, number>;
  if (row.sentAt == null) return { counts: current };

  const { CloudWatchClient, GetMetricDataCommand } = await import("@aws-sdk/client-cloudwatch");
  const cw = new CloudWatchClient({ region: process.env.AWS_REGION });
  // Day buckets from the day before the send: opens keep trickling in for weeks.
  const start = new Date((Math.floor(Number(row.sentAt) / 1000 / DAY_S) - 1) * DAY_S * 1000);
  const out = await cw.send(
    new GetMetricDataCommand({
      StartTime: start,
      EndTime: new Date(),
      MetricDataQueries: Object.entries(METRICS).map(([metric, id]) => ({
        Id: id,
        MetricStat: {
          Metric: { Namespace: "AWS/SES", MetricName: metric, Dimensions: [{ Name: "campaign", Value: String(row.id) }] },
          Period: DAY_S,
          Stat: "Sum",
        },
      })),
    }),
  );
  const counts = mergeCounts(current, sumMetricResults(out.MetricDataResults ?? []));
  const patch = Object.fromEntries(Object.values(METRICS).filter((k) => k in counts).map((k) => [k, counts[k]]));
  // Only the CloudWatch keys: a webhook bounce/complaint landing meanwhile is kept.
  await db
    .update(campaign)
    .set({ counts: sql`${campaign.counts} || ${JSON.stringify(patch)}::jsonb` })
    .where(eq(campaign.id, row.id));
  return { counts };
}
