import { getAppSettings } from "@/lib/services/app-settings.service";
import { zonedDateIso } from "@foundry/commons";
import { bucketCounts } from "@/lib/analytics/buckets";
import { isoDateInZone } from "@/lib/analytics/profitability";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, deliveryZones, mealSizes, orders, plans, tickets, users } from "@/db/schema";
import { categoryLabel, subcategoryLabel, SUBCATEGORIES, TICKET_CATEGORIES } from "@/lib/support/ticket-taxonomy";
import {
  COMPLAINT_CATEGORIES,
  IS_NEW,
  NOT_LINKED,
  complaintWhere,
  scopeToComplaintFilters,
  ticketOrgWhere,
} from "./complaint-filters";
import { localDay, type AnalyticsScope } from "./metrics/scope";

const intCount = sql<number>`cast(count(*) as int)`;

/**
 * Tickets joined to the order they were raised about (and that order's plan and
 * zone). LEFT joins throughout: linking an order is optional, and an inner join
 * would silently drop every unlinked ticket from totals that are supposed to
 * cover all of them.
 */
// Written out at each call site rather than behind a helper: drizzle infers row
// types through the chained builder, and a generic wrapper erases them.

function where(scope: AnalyticsScope, complaintsOnly = true) {
  return and(complaintWhere(scopeToComplaintFilters(scope), { complaintsOnly }), ticketOrgWhere(scope.orgIds));
}

export type ComplaintKpis = {
  total: number;
  open: number;
  resolved: number;
  resolutionRatePct: number | null;
  avgResolutionHours: number | null;
  perHundredTiffins: number | null;
  deliveredTiffins: number;
};

const OPEN_STATUSES = ["open", "in_progress", "waiting_on_customer"] as const;

/**
 * Delivered tiffins in the filtered window — the denominator that makes
 * complaint volume comparable as the business grows.
 *
 * The predicate mirrors lib/services/tiffin-counts.ts `deliveredTiffinCount`
 * (scheduled AND confirmed delivered), re-expressed in SQL
 * because analytics aggregates over far too many rows to load them into memory.
 * That file stays the canonical definition; complaints-rate.test.ts asserts the
 * two agree on the same fixtures, so they cannot drift unnoticed.
 */
async function deliveredTiffins(scope: AnalyticsScope): Promise<number> {
  const parts = [
    eq(deliveries.status, "scheduled"),
    eq(deliveries.optimoCompletionStatus, "success"),
  ];
  // deliveryDate is a DATE; the filters are epoch ms, so compare on app-timezone calendar days.
  parts.push(gte(deliveries.deliveryDate, zonedDateIso(scope.fromMs, scope.tz)));
  parts.push(lte(deliveries.deliveryDate, zonedDateIso(scope.toMs, scope.tz)));
  if (scope.plans.length) parts.push(inArray(plans.key, scope.plans));
  if (scope.mealSizes.length) parts.push(inArray(mealSizes.key, scope.mealSizes));
  if (scope.zones.length) parts.push(inArray(deliveryZones.name, scope.zones));
  const org = ticketOrgWhere(scope.orgIds);
  if (org) parts.push(org);

  const units = sql<number>`coalesce(sum(${deliveries.tiffinUnits}), 0)::int`;
  const [row] = await db
    .select({ units })
    .from(deliveries)
    .innerJoin(orders, eq(deliveries.orderId, orders.id))
    .leftJoin(plans, eq(orders.planId, plans.id))
    .leftJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .leftJoin(deliveryZones, eq(orders.zoneId, deliveryZones.id))
    .where(and(...parts));
  return row?.units ?? 0;
}

export async function getComplaintKpis(scope: AnalyticsScope): Promise<ComplaintKpis> {
  const cond = where(scope);
  // Counted in one pass: separate round trips would each re-run the same joins.
  const [[row], tiffins] = await Promise.all([
    db
    .select({
      total: intCount,
      open: sql<number>`cast(count(*) filter (where ${inArray(tickets.status, OPEN_STATUSES)}) as int)`,
      resolved: sql<number>`cast(count(*) filter (where ${inArray(tickets.status, ["resolved", "closed"])}) as int)`,
      avgMs: sql<number | null>`avg(${tickets.closedAt} - ${tickets.createdAt}) filter (where ${tickets.closedAt} is not null)`,
    })
    .from(tickets)
    .leftJoin(orders, eq(tickets.orderId, orders.id))
    .leftJoin(plans, eq(orders.planId, plans.id))
    .leftJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .leftJoin(deliveryZones, eq(orders.zoneId, deliveryZones.id)).where(cond),
    deliveredTiffins(scope),
  ]);

  const total = row?.total ?? 0;
  const resolved = row?.resolved ?? 0;
  const avgMs = row?.avgMs ?? null;
  return {
    total,
    open: row?.open ?? 0,
    resolved,
    resolutionRatePct: total > 0 ? Math.round((resolved / total) * 1000) / 10 : null,
    avgResolutionHours: avgMs != null ? Math.round((Number(avgMs) / 3_600_000) * 10) / 10 : null,
    // Per 100 delivered tiffins. null (not 0) when nothing was delivered: a rate
    // with no denominator is unknown, and printing 0 would read as "no problems".
    perHundredTiffins: tiffins > 0 ? Math.round((total / tiffins) * 100 * 100) / 100 : null,
    deliveredTiffins: tiffins,
  };
}

/** Complaints per day, for the trend chart. */
export async function getComplaintTrend(scope: AnalyticsScope) {
  const day = sql<string>`to_char(${localDay(tickets.createdAt, scope.tz)}, 'YYYY-MM-DD')`;
  const rows = await db
    .select({ day, n: intCount })
    .from(tickets)
    .leftJoin(orders, eq(tickets.orderId, orders.id))
    .leftJoin(plans, eq(orders.planId, plans.id))
    .leftJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .leftJoin(deliveryZones, eq(orders.zoneId, deliveryZones.id))
    .where(where(scope))
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  return bucketCounts(
    rows.map((r) => ({ iso: r.day, n: r.n })),
    ["n"],
    isoDateInZone(scope.fromMs, scope.tz),
    isoDateInZone(scope.toMs, scope.tz),
  );
}

/**
 * Category breakdown. complaintsOnly is false here on purpose: Feedback &
 * Suggestions is excluded from the complaint METRICS but still worth seeing and
 * clicking through to.
 */
export async function getByCategory(scope: AnalyticsScope) {
  const rows = await db
    .select({ category: tickets.category, n: intCount })
    .from(tickets)
    .leftJoin(orders, eq(tickets.orderId, orders.id))
    .leftJoin(plans, eq(orders.planId, plans.id))
    .leftJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .leftJoin(deliveryZones, eq(orders.zoneId, deliveryZones.id))
    .where(where(scope, false))
    .groupBy(tickets.category);

  const counts = new Map(rows.map((r) => [r.category as string, r.n]));
  // Every current category is listed even at zero, so a category that stopped
  // generating complaints is visibly at zero rather than silently absent.
  return TICKET_CATEGORIES.map((c) => ({
    value: c as string,
    category: categoryLabel(c),
    n: counts.get(c) ?? 0,
    isComplaint: (COMPLAINT_CATEGORIES as string[]).includes(c),
  })).concat(
    rows
      .filter((r) => !(TICKET_CATEGORIES as readonly string[]).includes(r.category as string))
      .map((r) => ({ value: r.category as string, category: categoryLabel(r.category), n: r.n, isComplaint: true })),
  );
}

/** Sub-category counts within one category (the drill-down). */
export async function getBySubcategory(scope: AnalyticsScope, category: string) {
  const rows = await db
    .select({ subcategory: tickets.subcategory, n: intCount })
    .from(tickets)
    .leftJoin(orders, eq(tickets.orderId, orders.id))
    .leftJoin(plans, eq(orders.planId, plans.id))
    .leftJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .leftJoin(deliveryZones, eq(orders.zoneId, deliveryZones.id))
    .where(and(where(scope, false), eq(tickets.category, category as never)))
    .groupBy(tickets.subcategory);

  const counts = new Map(rows.map((r) => [r.subcategory ?? "", r.n]));
  const known = (SUBCATEGORIES[category as keyof typeof SUBCATEGORIES] ?? []).map((s) => ({
    value: s.value,
    label: s.label,
    n: counts.get(s.value) ?? 0,
  }));
  // Tickets raised before the two-level picker have no sub-category.
  const unspecified = counts.get("") ?? 0;
  return unspecified > 0 ? [...known, { value: "", label: "Unspecified", n: unspecified }] : known;
}

/** Status mix, with New derived as "open and nobody has replied". */
export async function getStatusMix(scope: AnalyticsScope) {
  const [row] = await db
    .select({
      isNew: sql<number>`cast(count(*) filter (where ${IS_NEW}) as int)`,
      open: sql<number>`cast(count(*) filter (where ${eq(tickets.status, "open")}) as int)`,
      inProgress: sql<number>`cast(count(*) filter (where ${eq(tickets.status, "in_progress")}) as int)`,
      waiting: sql<number>`cast(count(*) filter (where ${eq(tickets.status, "waiting_on_customer")}) as int)`,
      resolved: sql<number>`cast(count(*) filter (where ${eq(tickets.status, "resolved")}) as int)`,
      closed: sql<number>`cast(count(*) filter (where ${eq(tickets.status, "closed")}) as int)`,
    })
    .from(tickets)
    .leftJoin(orders, eq(tickets.orderId, orders.id))
    .leftJoin(plans, eq(orders.planId, plans.id))
    .leftJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .leftJoin(deliveryZones, eq(orders.zoneId, deliveryZones.id))
    .where(where(scope));

  const isNew = row?.isNew ?? 0;
  return [
    { value: "new", status: "New", n: isNew },
    // Open excludes the New slice so the six numbers sum to the total rather
    // than counting an unanswered ticket twice.
    { value: "open", status: "Open", n: Math.max(0, (row?.open ?? 0) - isNew) },
    { value: "in_progress", status: "In progress", n: row?.inProgress ?? 0 },
    { value: "waiting_on_customer", status: "Waiting for customer", n: row?.waiting ?? 0 },
    { value: "resolved", status: "Resolved", n: row?.resolved ?? 0 },
    { value: "closed", status: "Closed", n: row?.closed ?? 0 },
  ];
}

export const PRIORITY_ORDER = ["urgent", "high", "normal", "low"] as const;

export async function getPriorityMix(scope: AnalyticsScope) {
  const rows = await db
    .select({ priority: tickets.priority, n: intCount })
    .from(tickets)
    .leftJoin(orders, eq(tickets.orderId, orders.id))
    .leftJoin(plans, eq(orders.planId, plans.id))
    .leftJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .leftJoin(deliveryZones, eq(orders.zoneId, deliveryZones.id))
    .where(where(scope))
    .groupBy(tickets.priority);
  const counts = new Map(rows.map((r) => [r.priority as string, r.n]));
  return PRIORITY_ORDER.map((p) => ({ value: p, n: counts.get(p) ?? 0 }));
}

/** The most common (category, sub-category) pairs — "top issues". */
export async function getTopIssues(scope: AnalyticsScope, limit = 8) {
  const rows = await db
    .select({ category: tickets.category, subcategory: tickets.subcategory, n: intCount })
    .from(tickets)
    .leftJoin(orders, eq(tickets.orderId, orders.id))
    .leftJoin(plans, eq(orders.planId, plans.id))
    .leftJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .leftJoin(deliveryZones, eq(orders.zoneId, deliveryZones.id))
    .where(where(scope))
    .groupBy(tickets.category, tickets.subcategory)
    .orderBy(desc(intCount))
    .limit(limit);

  return rows.map((r) => ({
    category: r.category as string,
    subcategory: r.subcategory ?? "",
    label: subcategoryLabel(r.category, r.subcategory) ?? categoryLabel(r.category),
    categoryLabel: categoryLabel(r.category),
    n: r.n,
  }));
}

/** Customers who complained more than once in the window. */
export async function getRepeatCustomers(scope: AnalyticsScope, limit = 8) {
  const rows = await db
    .select({
      publicId: users.publicId,
      name: users.name,
      email: users.email,
      n: intCount,
      lastAt: sql<number>`max(${tickets.createdAt})`,
    })
    .from(tickets)
    .innerJoin(users, eq(tickets.raisedBy, users.id))
    .leftJoin(orders, eq(tickets.orderId, orders.id))
    .leftJoin(plans, eq(orders.planId, plans.id))
    .leftJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .leftJoin(deliveryZones, eq(orders.zoneId, deliveryZones.id))
    .where(where(scope))
    .groupBy(users.publicId, users.name, users.email)
    .having(sql`count(*) > 1`)
    .orderBy(desc(intCount))
    .limit(limit);
  return rows;
}

/** Plan and zone splits, each with an explicit unlinked bucket. */
export async function getByPlan(scope: AnalyticsScope) {
  const rows = await db
    .select({ key: plans.key, name: plans.name, n: intCount })
    .from(tickets)
    .leftJoin(orders, eq(tickets.orderId, orders.id))
    .leftJoin(plans, eq(orders.planId, plans.id))
    .leftJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .leftJoin(deliveryZones, eq(orders.zoneId, deliveryZones.id))
    .where(where(scope))
    .groupBy(plans.key, plans.name);
  return rows.map((r) => ({
    value: r.key ?? NOT_LINKED,
    label: r.name ?? "Not linked to an order",
    n: r.n,
  }));
}

export async function getByZone(scope: AnalyticsScope) {
  const rows = await db
    .select({ name: deliveryZones.name, n: intCount })
    .from(tickets)
    .leftJoin(orders, eq(tickets.orderId, orders.id))
    .leftJoin(plans, eq(orders.planId, plans.id))
    .leftJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .leftJoin(deliveryZones, eq(orders.zoneId, deliveryZones.id))
    .where(where(scope))
    .groupBy(deliveryZones.name);
  return rows.map((r) => ({ value: r.name ?? NOT_LINKED, label: r.name ?? "Not linked to an order", n: r.n }));
}

// A ticket waiting on staff whose last activity is older than this is overdue —
// the same 24h rule the ticket queue already uses (tickets.service computeOverdue).
const OVERDUE_MS = 24 * 60 * 60 * 1000;

export type NeedsAttention = {
  urgent: number;
  overdue: number;
  unanswered: number;
  repeatCustomers: number;
};

/** The three "act on this now" counts, each linking to the tickets behind it. */
export async function getNeedsAttention(scope: AnalyticsScope, now = Date.now()): Promise<NeedsAttention> {
  const cond = where(scope);
  const lastMessage = sql`(
    select max(m.created_at) from ticket_messages m where m.ticket_id = ${tickets.id}
  )`;

  const [[row], repeats] = await Promise.all([
    db
      .select({
        urgent: sql<number>`cast(count(*) filter (where ${inArray(tickets.priority, ["high", "urgent"])} and ${inArray(tickets.status, OPEN_STATUSES)}) as int)`,
        overdue: sql<number>`cast(count(*) filter (where ${inArray(tickets.status, ["open", "in_progress"])} and ${lastMessage} < ${now - OVERDUE_MS}) as int)`,
        unanswered: sql<number>`cast(count(*) filter (where ${IS_NEW}) as int)`,
      })
      .from(tickets)
      .leftJoin(orders, eq(tickets.orderId, orders.id))
      .leftJoin(plans, eq(orders.planId, plans.id))
      .leftJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
      .leftJoin(deliveryZones, eq(orders.zoneId, deliveryZones.id))
      .where(cond),
    getRepeatCustomers(scope, 100),
  ]);

  return {
    urgent: row?.urgent ?? 0,
    overdue: row?.overdue ?? 0,
    unanswered: row?.unanswered ?? 0,
    repeatCustomers: repeats.length,
  };
}

/** Options for the plan and zone filters. */
export async function getFilterOptions() {
  const [planRows, zoneRows] = await Promise.all([
    db.select({ value: plans.key, label: plans.name }).from(plans).orderBy(asc(plans.name)),
    db
      .select({ value: deliveryZones.name, label: deliveryZones.name })
      .from(deliveryZones)
      .where(eq(deliveryZones.active, true))
      .orderBy(asc(deliveryZones.name)),
  ]);
  const notLinked = { value: NOT_LINKED, label: "Not linked" };
  return { plans: [...planRows, notLinked], zones: [...zoneRows, notLinked] };
}
