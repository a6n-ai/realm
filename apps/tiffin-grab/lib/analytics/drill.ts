/**
 * Links from an analytics figure to the list that produced it.
 *
 * The payments list filters `createdAt` with epoch `from`/`to`. Revenue totals
 * follow the day the money moved (capturedAt, else createdAt) in the app
 * timezone. These helpers turn that calendar range into the epoch window the
 * list already understands, so a click lands on the same days.
 */

import type { AnalyticsScope } from "@/lib/services/analytics/metrics/scope";

type Visible = "all" | string[];

const PAYMENTS = "/dashboard/payments/all";
const ORDERS = "/dashboard/orders";
const INQUIRIES = "/dashboard/inquiries";
const CUSTOMERS = "/dashboard/customers";

function zoneOffsetMs(epoch: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(epoch));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  // h23 can report midnight as hour 24 on the previous calendar day.
  const hour = get("hour") % 24;
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return asUtc - epoch;
}

/** Epoch ms of midnight at the start of `isoDate` in `timeZone`. */
export function zonedDayStart(isoDate: string, timeZone: string): number {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const utcMidnight = Date.UTC(y, m - 1, d);
  let start = utcMidnight - zoneOffsetMs(utcMidnight, timeZone);
  start = utcMidnight - zoneOffsetMs(start, timeZone);
  return start;
}

function nextIsoDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** Inclusive calendar range in `timeZone`, as the epoch window list filters expect. */
export function zonedRangeMs(from: string, to: string, timeZone: string): { from: number; to: number } {
  return { from: zonedDayStart(from, timeZone), to: zonedDayStart(nextIsoDate(to), timeZone) - 1 };
}

/**
 * `org` is omitted when it adds nothing: all franchises, or the viewer's whole visible set.
 * A restricted scope with no orgs serializes as "none" (never an empty value, which would widen).
 */
function orgParam(scope: AnalyticsScope, visible?: Visible): string | null {
  if (scope.orgIds === "all") return null;
  const sameAsVisible =
    visible != null &&
    visible !== "all" &&
    scope.orgIds.length === visible.length &&
    scope.orgIds.every((id) => visible.includes(id));
  if (sameAsVisible) return null;
  return scope.orgIds.length ? scope.orgIds.join(",") : "none";
}

function withScope(qs: URLSearchParams, scope: AnalyticsScope, visible?: Visible) {
  qs.set("from", String(scope.fromMs));
  qs.set("to", String(scope.toMs));
  const org = orgParam(scope, visible);
  if (org) qs.set("org", org);
}

const withQuery = (path: string, qs: URLSearchParams) => {
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
};

/** Money tiles carry the scope's dates and franchise; the payments list is not guaranteed to match their totals. */
export function paymentsHref(
  scope: AnalyticsScope,
  opts: {
    statuses?: readonly string[];
    methods?: readonly string[];
    /** "money": date the list by when the money moved (capture), like the revenue tiles. */
    basis?: "money";
  } = {},
  visible?: Visible,
): string {
  const qs = new URLSearchParams();
  if (opts.basis) qs.set("basis", opts.basis);
  if (opts.statuses?.length) qs.set("status", opts.statuses.join(","));
  if (opts.methods?.length) qs.set("method", opts.methods.join(","));
  withScope(qs, scope, visible);
  return withQuery(PAYMENTS, qs);
}

/**
 * Link to the Orders listing showing the rows countOrders counted. The listing's Status facet is a
 * single-value pill (a comma list would match nothing), so at most one status is allowed.
 * Pure (no db) so client components can import this file; metrics/orders.ts re-exports it.
 */
export function ordersDrillHref(scope: AnalyticsScope, extra: { status?: string[] } = {}, visible?: Visible): string {
  if ((extra.status?.length ?? 0) > 1) throw new Error("Orders links carry at most one status");
  const qs = new URLSearchParams();
  withScope(qs, scope, visible);
  if (extra.status?.length) qs.set("status", extra.status[0]);
  if (scope.plans.length) qs.set("plan", scope.plans.join(","));
  if (scope.mealSizes.length) qs.set("mealSize", scope.mealSizes.join(","));
  if (scope.zones.length) qs.set("zone", scope.zones.join(","));
  qs.set("view", "all");
  return `${ORDERS}?${qs}`;
}

export const ordersHref = ordersDrillHref;

/** Carries date and franchise only; the inquiries list is not guaranteed to match lead tiles. */
export function inquiriesHref(
  scope: AnalyticsScope,
  params: { stage?: string; source?: string; owner?: string } = {},
  visible?: Visible,
): string {
  const qs = new URLSearchParams();
  withScope(qs, scope, visible);
  if (params.stage) qs.set("stage", params.stage);
  if (params.source) qs.set("source", params.source);
  if (params.owner) qs.set("owner", params.owner);
  return withQuery(INQUIRIES, qs);
}

export function customersHref(scope: AnalyticsScope, visible?: Visible): string {
  const qs = new URLSearchParams();
  withScope(qs, scope, visible);
  return withQuery(CUSTOMERS, qs);
}
