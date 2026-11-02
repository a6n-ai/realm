import { and, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { couponRedemptions, coupons, inquiries, orderActivities, orders, tickets, users } from "@/db/schema";
import { leadWhere as scopedLeadWhere } from "./leads.service";
import { laterOrderSql } from "@/lib/services/orders.service";
import { revenueBy } from "./metrics/money";
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
  ordersOwned: number;
  revenueOwned: number;
  /** Share of owned orders with a later plan by the same customer; null with no owned orders. */
  renewalRatePct: number | null;
  actions: number;
};

export type EmployeeRollup = { rows: EmployeeRow[]; unassignedRevenue: number };

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
export async function getEmployeeRollup(scope: AnalyticsScope): Promise<EmployeeRollup> {
  if (scope.orgIds !== "all" && scope.orgIds.length === 0) return { rows: [], unassignedRevenue: 0 };
  const window = { fromMs: scope.fromMs, toMs: scope.toMs };
  const [leadRows, ticketRows, couponRows, staff, ownedRows, revenueRows, actionRows] = await Promise.all([
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
    db.select({ id: users.id, publicId: users.publicId, name: users.name, email: users.email, isSystem: users.isSystem, role: users.role }).from(users),
    db
      .select({
        owner: orders.currentOwner,
        n: intCount,
        renewed: sql<number>`cast(count(*) filter (where ${laterOrderSql}) as int)`,
      })
      .from(orders)
      .where(and(isNotNull(orders.currentOwner), dateWhere(orders.createdAt, window), ordersScope(scope)))
      .groupBy(orders.currentOwner),
    revenueBy(scope, "owner"),
    db
      .select({ actor: orderActivities.createdBy, n: intCount })
      .from(orderActivities)
      .innerJoin(orders, sql`${orders.id} = ${orderActivities.orderId}`)
      .where(and(isNotNull(orderActivities.createdBy), dateWhere(orderActivities.createdAt, window), ordersScope(scope)))
      .groupBy(orderActivities.createdBy),
  ]);

  // Customers log order actions too (pause, edit meals) and system users run jobs: only staff are reps.
  const repIds = new Set(staff.filter((u) => !u.isSystem && u.role !== "user").map((u) => u.id.toString()));
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
        ordersOwned: 0,
        revenueOwned: 0,
        renewalRatePct: null,
        actions: 0,
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

  for (const r of ownedRows) {
    if (!r.owner) continue;
    const row = ensure(r.owner);
    row.ordersOwned = r.n;
    row.renewalRatePct = r.n > 0 ? Math.round((r.renewed / r.n) * 1000) / 10 : null;
  }
  let unassignedRevenue = 0;
  for (const r of revenueRows) {
    if (r.key === "unknown") unassignedRevenue = r.net;
    else if (r.net !== 0) ensure(BigInt(r.key)).revenueOwned = r.net;
  }
  for (const r of actionRows) {
    if (r.actor) ensure(r.actor).actions = r.n;
  }

  // Revenue on an order a non-staff user owns is nobody's, so it joins the unassigned bucket.
  for (const r of byOwner.values()) if (!repIds.has(r.userId)) unassignedRevenue += r.revenueOwned;
  const rows = [...byOwner.values()]
    .filter((r) => repIds.has(r.userId))
    .filter((r) => r.leadsWorked + r.ticketsResolved + r.repDailyCoupons + r.ordersOwned + r.actions > 0 || r.revenueOwned !== 0)
    .sort((a, b) => b.revenueOwned - a.revenueOwned || b.actions - a.actions);
  return { rows, unassignedRevenue };
}
