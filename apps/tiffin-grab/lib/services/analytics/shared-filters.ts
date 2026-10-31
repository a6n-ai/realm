import { and, asc, eq, exists, inArray, sql, type SQL } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveryZones, mealSizes, orders, organization, plans, tickets } from "@/db/schema";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { ticketOrgWhere } from "./complaint-filters";
import { dateWhere, dateWhereCalendar, ordersScope, resolveAnalyticsScope } from "./metrics/scope";
import {
  parseAnalyticsFilters as parseAnalyticsFiltersSync,
  type AnalyticsFilterOptions,
  type AnalyticsFilters,
  type AnalyticsSearchParams,
} from "./shared-filter-params";

export {
  ANALYTICS_FILTER_PARAMS,
  currentMonthEpochRange,
  hasDimensionFilters,
  hasDateFilter,
  type AnalyticsSearchParams,
  type AnalyticsFilters,
  type AnalyticsFilterOptions,
} from "./shared-filter-params";

/**
 * Parse URL filters through `resolveAnalyticsScope`: dates default to the current business month and
 * `orgIds` is the session's visible orgs narrowed by `org` (throws NoFranchiseAccessError otherwise).
 */
export async function parseAnalyticsFilters(
  sp: AnalyticsSearchParams,
  session: Parameters<typeof resolveAnalyticsScope>[1],
): Promise<AnalyticsFilters> {
  const scope = await resolveAnalyticsScope(sp, session);
  return {
    from: scope.fromMs,
    to: scope.toMs,
    plans: scope.plans,
    mealSizes: scope.mealSizes,
    zones: scope.zones,
    orgIds: scope.orgIds,
  };
}

/** Dimension-only parse (no date default). Prefer `parseAnalyticsFilters` for pages. */
export { parseAnalyticsFiltersSync };

/** Epoch `createdAt`/`capturedAt`-style columns. */
export function epochRangeWhere(col: AnyColumn, f: AnalyticsFilters): SQL | undefined {
  return dateWhere(col, { fromMs: f.from, toMs: f.to });
}

/**
 * Calendar `date` columns (deliveries.delivery_date). Converts the epoch range
 * through the business timezone so a single picked day matches that wall day.
 */
export async function calendarDateWhere(col: AnyColumn, f: AnalyticsFilters): Promise<SQL | undefined> {
  if (f.from == null && f.to == null) return undefined;
  const { timezone } = await getAppSettings();
  return dateWhereCalendar(col, { fromMs: f.from, toMs: f.to, tz: timezone });
}

/** Restricts to orders in the filter's orgs and matching plan / meal size / zone. */
export function ordersMatchFilters(f: AnalyticsFilters): SQL | undefined {
  return ordersScope(f);
}

/** `visibleOrgIds` limits the franchise list (the session's visible set). */
export async function getAnalyticsFilterOptions(
  visibleOrgIds: "all" | string[],
): Promise<AnalyticsFilterOptions> {
  const noOrgs = visibleOrgIds !== "all" && visibleOrgIds.length === 0;
  const orderOrg = visibleOrgIds === "all" ? undefined : noOrgs ? sql`false` : inArray(orders.organizationId, visibleOrgIds);
  const hasOrder = (col: typeof orders.mealSizeId | typeof orders.zoneId, id: typeof mealSizes.id | typeof deliveryZones.id) =>
    exists(db.select({ one: orders.id }).from(orders).where(and(eq(col, id), orderOrg)));
  const [planRows, sizeRows, zoneRows, orgRows, ticketRows] = await Promise.all([
    db
      .select({ value: plans.key, label: plans.name })
      .from(plans)
      .where(eq(plans.active, true))
      .orderBy(asc(plans.name)),
    db
      .select({ value: mealSizes.key, label: mealSizes.name, parent: plans.key })
      .from(mealSizes)
      .innerJoin(plans, eq(mealSizes.planId, plans.id))
      .where(and(eq(mealSizes.active, true), eq(mealSizes.custom, false), hasOrder(orders.mealSizeId, mealSizes.id)))
      .orderBy(asc(mealSizes.name)),
    visibleOrgIds !== "all" && visibleOrgIds.length === 0
      ? Promise.resolve([])
      : db
          .selectDistinct({ value: deliveryZones.name, label: deliveryZones.name })
          .from(deliveryZones)
          .where(
            and(
              eq(deliveryZones.active, true),
              hasOrder(orders.zoneId, deliveryZones.id),
              visibleOrgIds === "all" ? undefined : inArray(deliveryZones.organizationId, visibleOrgIds),
            ),
          )
          .orderBy(asc(deliveryZones.name)),
    visibleOrgIds !== "all" && visibleOrgIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ value: organization.id, label: organization.name })
          .from(organization)
          .where(visibleOrgIds === "all" ? undefined : inArray(organization.id, visibleOrgIds))
          .orderBy(asc(organization.name)),
    noOrgs
      ? Promise.resolve([])
      : db
          .selectDistinct({ category: tickets.category, subcategory: tickets.subcategory })
          .from(tickets)
          .leftJoin(orders, eq(tickets.orderId, orders.id))
          .where(ticketOrgWhere(visibleOrgIds)),
  ]);
  return {
    plans: planRows,
    mealSizes: sizeRows,
    zones: zoneRows,
    orgs: orgRows,
    tickets: ticketRows.flatMap((t) => (t.subcategory ? [{ category: t.category, subcategory: t.subcategory }] : [{ category: t.category }])),
  };
}
