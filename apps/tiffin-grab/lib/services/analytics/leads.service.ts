import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveryZones, inquiries, leadSources, mealSizes } from "@/db/schema";
import { dateWhere, type AnalyticsScope } from "./metrics/scope";

const intCount = sql<number>`cast(count(*) as int)`;

export type LeadStats = { total: number; converted: number; lost: number; conversionRatePct: number };

/**
 * Inquiries carry their own nullable organization_id (filled during the franchise backfill; there is no
 * order to join through). A franchise-scoped view counts only inquiries stamped with one of its orgs;
 * unstamped ones appear under All franchises only.
 */
export function leadWhere(scope: AnalyticsScope): SQL | undefined {
  const parts: (SQL | undefined)[] = [dateWhere(inquiries.createdAt, { fromMs: scope.fromMs, toMs: scope.toMs })];
  if (scope.orgIds !== "all") parts.push(scope.orgIds.length ? inArray(inquiries.organizationId, scope.orgIds) : sql`false`);
  if (scope.plans.length) parts.push(inArray(inquiries.planInterest, scope.plans));
  // Interest stores meal size publicId; shared filters use meal size keys.
  if (scope.mealSizes.length) {
    parts.push(
      sql`${inquiries.mealSizeInterest} in (
        select ${mealSizes.publicId} from ${mealSizes} where ${inArray(mealSizes.key, scope.mealSizes)}
      )`,
    );
  }
  if (scope.zones.length) {
    parts.push(
      sql`${inquiries.zoneId} in (select ${deliveryZones.id} from ${deliveryZones} where ${inArray(deliveryZones.name, scope.zones)})`,
    );
  }
  const defined = parts.filter((p): p is SQL => p != null);
  return defined.length ? and(...defined) : undefined;
}

export async function getLeadStats(
  scope: AnalyticsScope,
): Promise<LeadStats> {
  const where = leadWhere(scope);
  const [[{ n: total }], [{ n: converted }], [{ n: lost }]] = await Promise.all([
    db.select({ n: intCount }).from(inquiries).where(where),
    db.select({ n: intCount }).from(inquiries).where(and(eq(inquiries.stage, "converted"), where)),
    db.select({ n: intCount }).from(inquiries).where(and(eq(inquiries.stage, "lost"), where)),
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

export async function getLeadsByStage(scope: AnalyticsScope) {
  const rows = await db
    .select({ stage: inquiries.stage, n: intCount })
    .from(inquiries)
    .where(leadWhere(scope))
    .groupBy(inquiries.stage);
  return rows.map((r) => ({ stage: STAGE_LABELS[r.stage] ?? r.stage, key: r.stage, n: r.n }));
}

const LOST_REASON_LABELS: Record<string, string> = {
  price: "Price",
  out_of_zone: "Out of zone",
  no_response: "No response",
  chose_competitor: "Chose competitor",
  not_ready: "Not ready",
  other: "Other",
};

export async function getLostReasonBreakdown(
  scope: AnalyticsScope,
) {
  const rows = await db
    .select({ reason: inquiries.lostReason, n: intCount })
    .from(inquiries)
    .where(and(eq(inquiries.stage, "lost"), leadWhere(scope)))
    .groupBy(inquiries.lostReason);
  return rows
    .filter((r) => r.reason != null)
    .map((r) => ({ reason: LOST_REASON_LABELS[r.reason!] ?? r.reason!, n: r.n }));
}

export type SourcePerf = { key: string; source: string; total: number; converted: number; lost: number; conversionRatePct: number };

export async function getSourcePerformance(
  scope: AnalyticsScope,
): Promise<SourcePerf[]> {
  const rows = await db
    .select({
      key: leadSources.key,
      source: leadSources.label,
      total: intCount,
      converted: sql<number>`cast(count(*) filter (where ${inquiries.stage} = 'converted') as int)`,
      lost: sql<number>`cast(count(*) filter (where ${inquiries.stage} = 'lost') as int)`,
    })
    .from(inquiries)
    .innerJoin(leadSources, eq(inquiries.sourceId, leadSources.id))
    .where(leadWhere(scope))
    .groupBy(leadSources.key, leadSources.label)
    .orderBy(sql`count(*) desc`);
  return rows.map((r) => ({
    ...r,
    conversionRatePct: r.total > 0 ? Math.round((r.converted / r.total) * 1000) / 10 : 0,
  }));
}
