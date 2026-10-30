import "server-only";
import { and, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";
import { deliveryZones, mealSizes, orders, plans } from "@/db/schema";
import { isoDateInZone } from "@/lib/analytics/profitability";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { resolveSessionVisibleOrgIds } from "@/lib/services/orders.service";
import { currentMonthEpochRange } from "../shared-filter-params";

export type AnalyticsScope = {
  orgIds: "all" | string[];
  fromMs: number;
  toMs: number;
  tz: string;
  plans: string[];
  mealSizes: string[];
  zones: string[];
  /** Tab-only params (method, complaint category/subcategory/status) carried through drill links. */
  extra: Record<string, string[]>;
};

export type ScopeSearchParams = Record<string, string | undefined>;

const EXTRA_PARAMS = ["method", "category", "subcategory", "status"];

export const DATE_BASIS_LABEL = {
  money: "by payment date",
  orders: "by order date",
  deliveries: "by delivery date",
  tickets: "by ticket date",
} as const;

const list = (raw: string | undefined): string[] =>
  (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const epoch = (raw: string | undefined): number | undefined => {
  if (!raw) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const n = Date.parse(`${raw}T00:00:00.000Z`);
    return Number.isFinite(n) ? n : undefined;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
};

/** Visible orgs narrowed by the `org` URL value. A value outside the visible set yields [] (never widens). */
export function intersectOrgs(visible: "all" | string[], requested: string[]): "all" | string[] {
  if (requested.length === 0) return visible;
  if (visible === "all") return requested;
  return requested.filter((id) => visible.includes(id));
}

/** Pure scope builder; `resolveAnalyticsScope` supplies the session-derived inputs. */
export function buildAnalyticsScope(
  sp: ScopeSearchParams,
  visible: "all" | string[],
  tz: string,
  now = Date.now(),
): AnalyticsScope {
  const month = currentMonthEpochRange(tz, now);
  const extra: Record<string, string[]> = {};
  for (const key of EXTRA_PARAMS) {
    const values = list(sp[key]);
    if (values.length) extra[key] = values;
  }
  return {
    orgIds: intersectOrgs(visible, list(sp.org)),
    fromMs: epoch(sp.from) ?? month.from,
    toMs: epoch(sp.to) ?? month.to,
    tz,
    plans: list(sp.plan),
    mealSizes: list(sp.mealSize),
    zones: list(sp.zone),
    extra,
  };
}

export async function resolveAnalyticsScope(
  sp: ScopeSearchParams,
  session: Parameters<typeof resolveSessionVisibleOrgIds>[0],
): Promise<AnalyticsScope> {
  const [{ timezone }, visible] = await Promise.all([getAppSettings(), resolveSessionVisibleOrgIds(session)]);
  return buildAnalyticsScope(sp, visible, timezone);
}

type Facets = Pick<AnalyticsScope, "plans" | "mealSizes" | "zones">;

/** Plan / meal size / zone via subqueries so callers need no extra joins. */
export function facetsWhere(f: Facets): SQL | undefined {
  const parts: SQL[] = [];
  if (f.plans.length) {
    parts.push(sql`${orders.planId} in (select ${plans.id} from ${plans} where ${inArray(plans.key, f.plans)})`);
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

/** Org (via the order's own organization_id) plus plan / meal size / zone. `[]` orgs matches nothing. */
export function ordersScope(scope: Pick<AnalyticsScope, "orgIds"> & Facets): SQL | undefined {
  const org =
    scope.orgIds === "all"
      ? undefined
      : scope.orgIds.length === 0
        ? sql`false`
        : inArray(orders.organizationId, scope.orgIds);
  return and(org, facetsWhere(scope));
}

type Window = { fromMs?: number; toMs?: number };

/** Epoch-ms columns (created_at, captured_at). */
export function dateWhere(col: AnyColumn, w: Window): SQL | undefined {
  const parts: SQL[] = [];
  if (w.fromMs != null) parts.push(gte(col, w.fromMs));
  if (w.toMs != null) parts.push(lte(col, w.toMs));
  return parts.length ? and(...parts) : undefined;
}

/** ISO `date` columns (delivery_date): the range is converted through the business timezone. */
export function dateWhereCalendar(col: AnyColumn, w: Window & { tz: string }): SQL | undefined {
  const parts: SQL[] = [];
  if (w.fromMs != null) parts.push(gte(col, isoDateInZone(w.fromMs, w.tz)));
  if (w.toMs != null) parts.push(lte(col, isoDateInZone(w.toMs, w.tz)));
  return parts.length ? and(...parts) : undefined;
}

/** Local calendar day of an epoch-ms column; tz is a bound value, never interpolated. */
export function localDay(col: AnyColumn | SQL, tz: string): SQL {
  return sql`(to_timestamp(${col} / 1000.0) at time zone ${tz})::date`;
}

export function scopeToSearchParams(scope: AnalyticsScope): URLSearchParams {
  const p = new URLSearchParams();
  p.set("from", String(scope.fromMs));
  p.set("to", String(scope.toMs));
  // An empty org list must not serialize as "org=", which parses back as "no filter" and widens.
  if (scope.orgIds !== "all") p.set("org", scope.orgIds.length ? scope.orgIds.join(",") : "none");
  if (scope.plans.length) p.set("plan", scope.plans.join(","));
  if (scope.mealSizes.length) p.set("mealSize", scope.mealSizes.join(","));
  if (scope.zones.length) p.set("zone", scope.zones.join(","));
  for (const [k, v] of Object.entries(scope.extra)) if (v.length) p.set(k, v.join(","));
  return p;
}
