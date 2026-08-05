import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { inquiries, leadSources } from "@/db/schema";

const intCount = sql<number>`cast(count(*) as int)`;

export type LeadStats = { total: number; converted: number; lost: number; conversionRatePct: number };

export async function getLeadStats(): Promise<LeadStats> {
  const [[{ n: total }], [{ n: converted }], [{ n: lost }]] = await Promise.all([
    db.select({ n: intCount }).from(inquiries),
    db.select({ n: intCount }).from(inquiries).where(eq(inquiries.stage, "converted")),
    db.select({ n: intCount }).from(inquiries).where(eq(inquiries.stage, "lost")),
  ]);
  return {
    total,
    converted,
    lost,
    conversionRatePct: total > 0 ? Math.round((converted / total) * 1000) / 10 : 0,
  };
}

const STAGE_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  quoted: "Quoted",
  follow_up: "Follow-up",
  converted: "Converted",
  lost: "Lost",
};

export async function getLeadsByStage() {
  const rows = await db.select({ stage: inquiries.stage, n: intCount }).from(inquiries).groupBy(inquiries.stage);
  return rows.map((r) => ({ stage: STAGE_LABELS[r.stage] ?? r.stage, n: r.n }));
}

const LOST_REASON_LABELS: Record<string, string> = {
  price: "Price",
  out_of_zone: "Out of zone",
  no_response: "No response",
  chose_competitor: "Chose competitor",
  not_ready: "Not ready",
  other: "Other",
};

export async function getLostReasonBreakdown() {
  const rows = await db
    .select({ reason: inquiries.lostReason, n: intCount })
    .from(inquiries)
    .where(eq(inquiries.stage, "lost"))
    .groupBy(inquiries.lostReason);
  return rows
    .filter((r) => r.reason != null)
    .map((r) => ({ reason: LOST_REASON_LABELS[r.reason!] ?? r.reason!, n: r.n }));
}

export type SourcePerf = { source: string; total: number; converted: number; conversionRatePct: number };

export async function getSourcePerformance(): Promise<SourcePerf[]> {
  const rows = await db
    .select({
      source: leadSources.label,
      total: intCount,
      converted: sql<number>`cast(count(*) filter (where ${inquiries.stage} = 'converted') as int)`,
    })
    .from(inquiries)
    .innerJoin(leadSources, eq(inquiries.sourceId, leadSources.id))
    .groupBy(leadSources.label)
    .orderBy(sql`count(*) desc`);
  return rows.map((r) => ({
    ...r,
    conversionRatePct: r.total > 0 ? Math.round((r.converted / r.total) * 1000) / 10 : 0,
  }));
}
