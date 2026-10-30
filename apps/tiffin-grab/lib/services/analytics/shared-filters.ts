import { and, asc, eq, inArray, type SQL } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveryZones, mealSizes, organization, plans } from "@/db/schema";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { dateWhere, dateWhereCalendar, facetsWhere, resolveAnalyticsScope } from "./metrics/scope";
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
 * Parse URL filters, defaulting a missing date range to the current business month.
 * With a session the result goes through `resolveAnalyticsScope`, so `orgs` is the
 * visible-org intersection; without one it is the raw `org` param (Stage 1 pages).
 */
export async function parseAnalyticsFilters(
  sp: AnalyticsSearchParams,
  session?: Parameters<typeof resolveAnalyticsScope>[1],
): Promise<AnalyticsFilters> {
  if (session === undefined) {
    const { timezone } = await getAppSettings();
    return parseAnalyticsFiltersSync(sp, { timezone });
  }
  const scope = await resolveAnalyticsScope(sp, session);
  return {
    from: scope.fromMs,
    to: scope.toMs,
    plans: scope.plans,
    mealSizes: scope.mealSizes,
    zones: scope.zones,
    orgs: scope.orgIds === "all" ? [] : scope.orgIds,
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

/** Restricts to orders matching plan / meal size / zone. */
export function ordersMatchFilters(f: AnalyticsFilters): SQL | undefined {
  return facetsWhere(f);
}

/** `visibleOrgIds` limits the franchise list; omitted means none are listed (facet hidden). */
export async function getAnalyticsFilterOptions(
  visibleOrgIds: "all" | string[] = [],
): Promise<AnalyticsFilterOptions> {
  const [planRows, sizeRows, zoneRows, orgRows] = await Promise.all([
    db
      .select({ value: plans.key, label: plans.name })
      .from(plans)
      .where(eq(plans.active, true))
      .orderBy(asc(plans.name)),
    db
      .select({ value: mealSizes.key, label: mealSizes.name, parent: plans.key })
      .from(mealSizes)
      .innerJoin(plans, eq(mealSizes.planId, plans.id))
      .where(and(eq(mealSizes.active, true), eq(mealSizes.custom, false)))
      .orderBy(asc(mealSizes.name)),
    db
      .select({ value: deliveryZones.name, label: deliveryZones.name })
      .from(deliveryZones)
      .where(eq(deliveryZones.active, true))
      .orderBy(asc(deliveryZones.name)),
    visibleOrgIds !== "all" && visibleOrgIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ value: organization.id, label: organization.name })
          .from(organization)
          .where(visibleOrgIds === "all" ? undefined : inArray(organization.id, visibleOrgIds))
          .orderBy(asc(organization.name)),
  ]);
  return { plans: planRows, mealSizes: sizeRows, zones: zoneRows, orgs: orgRows };
}
