import { and, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { couponRedemptions, coupons, inquiries, orders, tickets, users } from "@/db/schema";
import { leadWhere as scopedLeadWhere } from "./leads.service";
import { dateWhere, facetsWhere, ordersScope, type AnalyticsScope } from "./metrics/scope";

const intCount = sql<number>`cast(count(*) as int)`;

export type EmployeeRow = {
  userId: string;
  publicId: string | null;
  name: string;
  leadsWorked: number;
  leadsConverted: number;
  conversionRatePct: number;
  ticketsResolved: number;
  avgResolutionHours: number | null;
  repDailyCoupons: number;
};

const leadWhere = (scope: AnalyticsScope) => and(isNotNull(inquiries.currentOwner), scopedLeadWhere(scope));

// A ticket's franchise and plan / size / zone come from the order it is about, so a ticket with no
// order matches only when no franchise or facet narrows the view.
function ticketScope(scope: AnalyticsScope): SQL | undefined {
  const orderScope = ordersScope(scope);
  return orderScope ? sql`${tickets.orderId} in (select ${orders.id} from ${orders} where ${orderScope})` : undefined;
}

// Coupons have their own nullable organization_id (null = shared, so only All franchises counts it) and
// no plan / size / zone, so a facet keeps the coupons redeemed on an in-scope order.
function couponScope(scope: AnalyticsScope): SQL | undefined {
  const parts: SQL[] = [];
  if (scope.orgIds !== "all") parts.push(scope.orgIds.length ? inArray(coupons.organizationId, scope.orgIds) : sql`false`);
  const facets = facetsWhere(scope);
  if (facets) {
    parts.push(sql`exists (
      select 1 from ${couponRedemptions} inner join ${orders} on ${orders.id} = ${couponRedemptions.orderId}
      where ${couponRedemptions.couponId} = ${coupons.id} and ${facets}
    )`);
  }
  return parts.length ? and(...parts) : undefined;
}

// Per-rep rollup across leads/tickets/coupons — there's no dedicated staff
// table, reps are just `users` referenced via currentOwner/ownerUserId on
// the domain tables, so this merges several grouped queries by user id.
export async function getEmployeeRollup(scope: AnalyticsScope): Promise<EmployeeRow[]> {
  if (scope.orgIds !== "all" && scope.orgIds.length === 0) return [];
  const window = { fromMs: scope.fromMs, toMs: scope.toMs };
  const [leadRows, ticketRows, couponRows, staff] = await Promise.all([
    db
      .select({
        owner: inquiries.currentOwner,
        worked: intCount,
        converted: sql<number>`cast(count(*) filter (where ${inquiries.stage} = 'converted') as int)`,
      })
      .from(inquiries)
      .where(leadWhere(scope))
      .groupBy(inquiries.currentOwner),
    db
      .select({
        owner: tickets.currentOwner,
        resolved: intCount,
        avgMs: sql<number | null>`avg(${tickets.closedAt} - ${tickets.createdAt}) filter (where ${tickets.closedAt} is not null)`,
      })
      .from(tickets)
      .where(
        and(
          isNotNull(tickets.currentOwner),
          inArray(tickets.status, ["resolved", "closed"]),
          dateWhere(tickets.closedAt, window),
          ticketScope(scope),
        ),
      )
      .groupBy(tickets.currentOwner),
    db
      .select({ owner: coupons.ownerUserId, n: intCount })
      .from(coupons)
      .where(
        and(
          sql`${coupons.kind} in ('rep_daily', 'rep_code') and ${coupons.ownerUserId} is not null`,
          dateWhere(coupons.createdAt, window),
          couponScope(scope),
        ),
      )
      .groupBy(coupons.ownerUserId),
    db.select({ id: users.id, publicId: users.publicId, name: users.name, email: users.email }).from(users),
  ]);

  const staffById = new Map(staff.map((u) => [u.id.toString(), u]));

  const byOwner = new Map<string, EmployeeRow>();
  const ensure = (id: bigint): EmployeeRow => {
    const key = id.toString();
    let row = byOwner.get(key);
    if (!row) {
      row = {
        userId: key,
        publicId: staffById.get(key)?.publicId ?? null,
        name: staffById.get(key)?.name?.trim() || staffById.get(key)?.email || "Unknown",
        leadsWorked: 0,
        leadsConverted: 0,
        conversionRatePct: 0,
        ticketsResolved: 0,
        avgResolutionHours: null,
        repDailyCoupons: 0,
      };
      byOwner.set(key, row);
    }
    return row;
  };

  for (const r of leadRows) {
    if (!r.owner) continue;
    const row = ensure(r.owner);
    row.leadsWorked = r.worked;
    row.leadsConverted = r.converted;
    row.conversionRatePct = r.worked > 0 ? Math.round((r.converted / r.worked) * 1000) / 10 : 0;
  }
  for (const r of ticketRows) {
    if (!r.owner) continue;
    const row = ensure(r.owner);
    row.ticketsResolved = r.resolved;
    row.avgResolutionHours = r.avgMs != null ? Math.round((r.avgMs / 3_600_000) * 10) / 10 : null;
  }
  for (const r of couponRows) {
    if (!r.owner) continue;
    const row = ensure(r.owner);
    row.repDailyCoupons = r.n;
  }

  return [...byOwner.values()].sort((a, b) => b.leadsWorked - a.leadsWorked);
}
