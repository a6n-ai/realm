import { ratePct } from "@/lib/money";
import { and, eq, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { inquiries, inquiryActivities, leadSources, orders } from "@/db/schema";
import { dateWhere, intCount, orgWhere, type AnalyticsScope } from "./metrics/scope";
import {
  activityScopeWhere,
  firstSaleSql,
  inquiryFacetsWhere,
  lostSql,
  newLeadsSql,
  renewalsDueSql,
  renewedSql,
  renewalNumberSql,
} from "./round-metrics";

export type LeadStats = { total: number; converted: number; direct: number; lost: number; conversionRatePct: number };

/**
 * Inquiries carry their own nullable organization_id (filled during the franchise backfill; there is no
 * order to join through). A franchise-scoped view counts only inquiries stamped with one of its orgs;
 * unstamped ones appear under All franchises only.
 */
export function leadWhere(scope: AnalyticsScope): SQL | undefined {
  const parts: (SQL | undefined)[] = [
    dateWhere(inquiries.createdAt, { fromMs: scope.fromMs, toMs: scope.toMs }),
    orgWhere(inquiries.organizationId, scope.orgIds),
    inquiryFacetsWhere(scope),
  ];
  const defined = parts.filter((p): p is SQL => p != null);
  return defined.length ? and(...defined) : undefined;
}

const countWhere = (cond: SQL) => sql<number>`cast(count(*) filter (where ${cond}) as int)`;

// Counts of inquiry activities in range, so a lead, conversion or loss is counted on the day it happened.
export async function getLeadStats(scope: AnalyticsScope): Promise<LeadStats> {
  const [s] = await db
    .select({
      total: countWhere(newLeadsSql),
      converted: countWhere(firstSaleSql("lead")),
      direct: countWhere(firstSaleSql("direct")),
      lost: countWhere(lostSql("lead")),
    })
    .from(inquiryActivities)
    .innerJoin(inquiries, eq(inquiries.id, inquiryActivities.inquiryId))
    .where(activityScopeWhere(scope));
  return {
    ...s,
    conversionRatePct: s.total > 0 ? ratePct(s.converted, s.total) : 0,
  };
}

const STAGE_LABELS: Record<string, string> = {
  new: "Lead",
  contacted: "Responded",
  quoted: "Follow-up",
  follow_up: "Follow-up",
  converted: "Took plan/trial",
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

export const LOST_REASON_LABELS: Record<(typeof inquiries.lostReason.enumValues)[number], string> = {
  price: "Price",
  out_of_zone: "Out of zone",
  no_response: "No response",
  chose_competitor: "Chose competitor",
  not_ready: "Not ready",
  other: "Other",
  asked_to_stop: "Asked to stop",
};

export type LostReasonRow = { kind: "lead" | "renewal"; reason: string; n: number };

export async function getLostReasonBreakdown(scope: AnalyticsScope): Promise<LostReasonRow[]> {
  const kind = sql<"lead" | "renewal">`case when ${lostSql("lead")} then 'lead' else 'renewal' end`;
  const rows = await db
    .select({ kind, reason: inquiryActivities.lostReason, n: intCount })
    .from(inquiryActivities)
    .innerJoin(inquiries, eq(inquiries.id, inquiryActivities.inquiryId))
    .where(and(or(lostSql("lead"), lostSql("renewal")), activityScopeWhere(scope)))
    .groupBy(kind, inquiryActivities.lostReason);
  return rows
    .filter((r) => r.reason != null)
    .map((r) => ({ kind: r.kind, reason: LOST_REASON_LABELS[r.reason!] ?? r.reason!, n: r.n }));
}

export type SourcePerf = {
  key: string;
  source: string;
  total: number;
  converted: number;
  direct: number;
  lost: number;
  conversionRatePct: number;
};

export async function getSourcePerformance(scope: AnalyticsScope): Promise<SourcePerf[]> {
  const rows = await db
    .select({
      key: leadSources.key,
      source: leadSources.label,
      total: countWhere(newLeadsSql),
      converted: countWhere(firstSaleSql("lead")),
      direct: countWhere(firstSaleSql("direct")),
      lost: countWhere(lostSql("lead")),
    })
    .from(inquiryActivities)
    .innerJoin(inquiries, eq(inquiries.id, inquiryActivities.inquiryId))
    .innerJoin(leadSources, eq(inquiries.sourceId, leadSources.id))
    .where(activityScopeWhere(scope))
    .groupBy(leadSources.key, leadSources.label)
    .orderBy(sql`count(*) filter (where ${newLeadsSql}) desc`);
  return rows.map((r) => ({
    ...r,
    conversionRatePct: r.total > 0 ? ratePct(r.converted, r.total) : 0,
  }));
}

export type RenewalRound = { round: 1 | 2 | 3 | 4; due: number; renewed: number; ratePct: number | null };

/** Round 1 is the first sale, round N is "Renewal N-1"; round 4 is every round from 4 on. */
export async function getRenewalsByRound(scope: AnalyticsScope): Promise<RenewalRound[]> {
  const rows = await db
    .select({ round: renewalNumberSql, due: countWhere(renewalsDueSql), renewed: countWhere(renewedSql) })
    .from(inquiryActivities)
    .innerJoin(inquiries, eq(inquiries.id, inquiryActivities.inquiryId))
    .innerJoin(orders, eq(orders.id, inquiryActivities.orderId))
    .where(and(or(renewalsDueSql, renewedSql), activityScopeWhere(scope)))
    .groupBy(renewalNumberSql);
  return ([1, 2, 3, 4] as const).map((round) => {
    const r = rows.find((x) => Number(x.round) === round);
    const due = r?.due ?? 0;
    const renewed = r?.renewed ?? 0;
    return { round, due, renewed, ratePct: due > 0 ? ratePct(renewed, due) : null };
  });
}
