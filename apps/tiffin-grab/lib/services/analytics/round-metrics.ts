import "server-only";
import { and, inArray, sql, type SQL } from "drizzle-orm";
import { deliveryZones, inquiries, inquiryActivities, mealSizes, orders } from "@/db/schema";
import { dateWhere, type AnalyticsScope } from "./metrics/scope";

type Facets = Pick<AnalyticsScope, "plans" | "mealSizes" | "zones">;

/** Plan / meal size / zone of the inquiry's interest. */
export function inquiryFacetsWhere(f: Facets): SQL | undefined {
  const parts: SQL[] = [];
  if (f.plans.length) parts.push(inArray(inquiries.planInterest, f.plans));
  // Interest stores meal size publicId; shared filters use meal size keys.
  if (f.mealSizes.length) {
    parts.push(
      sql`${inquiries.mealSizeInterest} in (select ${mealSizes.publicId} from ${mealSizes} where ${inArray(mealSizes.key, f.mealSizes)})`,
    );
  }
  if (f.zones.length) {
    parts.push(
      sql`${inquiries.zoneId} in (select ${deliveryZones.id} from ${deliveryZones} where ${inArray(deliveryZones.name, f.zones)})`,
    );
  }
  return parts.length ? and(...parts) : undefined;
}

// Franchise: the activity's own organization_id, else its inquiry's (activities do not get one on insert).
function activityOrgWhere(orgIds: AnalyticsScope["orgIds"]): SQL | undefined {
  if (orgIds === "all") return undefined;
  if (orgIds.length === 0) return sql`false`;
  return inArray(sql`coalesce(${inquiryActivities.organizationId}, ${inquiries.organizationId})`, orgIds);
}

/** Activities in range (their own created_at) for the franchise and the inquiry's facets. Needs `inquiries` joined. */
export function activityScopeWhere(scope: AnalyticsScope): SQL | undefined {
  const parts = [dateWhere(inquiryActivities.createdAt, scope), activityOrgWhere(scope.orgIds), inquiryFacetsWhere(scope)];
  const defined = parts.filter((p): p is SQL => p != null);
  return defined.length ? and(...defined) : undefined;
}

/** A lead is a `created` activity with origin lead (no origin means lead), or a reopened reinquiry. */
export const newLeadsSql = sql`((${inquiryActivities.type} = 'created' and coalesce(${inquiryActivities.details}->>'origin', 'lead') = 'lead')
  or (${inquiryActivities.type} = 'reinquiry' and ${inquiryActivities.details}->>'reopened' = 'true'))`;

// Origin of the inquiry's own `created` activity; the correlated alias keeps the outer row's columns.
function inquiryOriginIn(origins: string[]): SQL {
  return sql`exists (
    select 1 from ${inquiryActivities} c
    where c.inquiry_id = ${inquiryActivities.inquiryId} and c.type = 'created'
      and coalesce(c.details->>'origin', 'lead') in (${sql.join(origins.map((o) => sql`${o}`), sql`, `)})
  )`;
}

export function firstSaleSql(kind: "lead" | "direct"): SQL {
  const origins = kind === "lead" ? ["lead"] : ["purchase", "backfill"];
  return sql`(${inquiryActivities.type} = 'converted' and ${inquiryOriginIn(origins)})`;
}

export const renewalsDueSql = sql`${inquiryActivities.type} = 'renewal_started'`;
export const renewedSql = sql`${inquiryActivities.type} = 'renewed'`;

export function lostSql(kind: "lead" | "renewal"): SQL {
  return kind === "lead"
    ? sql`(${inquiryActivities.type} = 'stage_change' and ${inquiryActivities.toStage} = 'lost')`
    : sql`(${inquiryActivities.type} = 'stage_change' and ${inquiryActivities.details}->>'renewalStatusTo' = 'not_renewed')`;
}

// Placement among the customer's orders, cancelled included (same rule as inquiries.service listActivities).
// Needs `orders` joined on the activity's order_id.
export const orderRankSql = sql<number>`(select count(*)::int from ${orders} o2 where o2.user_id = ${orders.userId} and o2.created_at <= ${orders.createdAt})`;

/**
 * Renewal number of a renewal event: renewal_started is stamped on the order that is ending (rank N → renewal N),
 * renewed on the new order (rank N → renewal N-1), so both land on the same renewal. 4 buckets every later one.
 */
export const renewalNumberSql = sql<number>`least(case when ${inquiryActivities.type} = 'renewed' then ${orderRankSql} - 1 else ${orderRankSql} end, 4)`;
