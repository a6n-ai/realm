import { and, asc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveryZones, mealSizes, orders, plans } from "@/db/schema";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { isoDateInZone } from "@/lib/analytics/profitability";
import type { AnalyticsFilters } from "./shared-filter-params";

export {
  ANALYTICS_FILTER_PARAMS,
  parseAnalyticsFilters,
  hasDimensionFilters,
  hasDateFilter,
  type AnalyticsSearchParams,
  type AnalyticsFilters,
} from "./shared-filter-params";

/** Epoch `createdAt`/`capturedAt`-style columns. */
export function epochRangeWhere(col: AnyColumn, f: AnalyticsFilters): SQL | undefined {
  const parts: SQL[] = [];
  if (f.from != null) parts.push(gte(col, f.from));
  if (f.to != null) parts.push(lte(col, f.to));
  return parts.length ? and(...parts) : undefined;
}

/**
 * Calendar `date` columns (deliveries.delivery_date). Converts the epoch range
 * through the business timezone so a single picked day matches that wall day.
 */
export async function calendarDateWhere(col: AnyColumn, f: AnalyticsFilters): Promise<SQL | undefined> {
  if (f.from == null && f.to == null) return undefined;
  const { timezone } = await getAppSettings();
  const parts: SQL[] = [];
  if (f.from != null) parts.push(gte(col, isoDateInZone(f.from, timezone)));
  if (f.to != null) parts.push(lte(col, isoDateInZone(f.to, timezone)));
  return parts.length ? and(...parts) : undefined;
}

/**
 * Restricts to orders matching plan / meal size / zone. Uses subqueries so
 * callers do not need extra joins on every query.
 */
export function ordersMatchFilters(f: AnalyticsFilters): SQL | undefined {
  const parts: SQL[] = [];
  if (f.plans.length) {
    parts.push(
      sql`${orders.planId} in (select ${plans.id} from ${plans} where ${inArray(plans.key, f.plans)})`,
    );
  }
  if (f.mealSizes.length) {
    parts.push(
      sql`${orders.mealSizeId} in (select ${mealSizes.id} from ${mealSizes} where ${inArray(mealSizes.key, f.mealSizes)})`,
    );
  }
  if (f.zones.length) {
    parts.push(
      sql`${orders.zoneId} in (select ${deliveryZones.id} from ${deliveryZones} where ${inArray(deliveryZones.name, f.zones)})`,
    );
  }
  return parts.length ? and(...parts) : undefined;
}

export type AnalyticsFilterOptions = {
  plans: { value: string; label: string }[];
  mealSizes: { value: string; label: string; parent: string }[];
  zones: { value: string; label: string }[];
};

export async function getAnalyticsFilterOptions(): Promise<AnalyticsFilterOptions> {
  const [planRows, sizeRows, zoneRows] = await Promise.all([
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
  ]);
  return { plans: planRows, mealSizes: sizeRows, zones: zoneRows };
}
