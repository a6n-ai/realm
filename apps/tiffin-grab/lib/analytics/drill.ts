/**
 * Links from an analytics figure to the list that produced it.
 *
 * The payments list filters `createdAt` with epoch `from`/`to`. Revenue totals
 * follow the day the money moved (capturedAt, else createdAt) in the app
 * timezone. These helpers turn that calendar range into the epoch window the
 * list already understands, so a click lands on the same days.
 */

import type { AnalyticsScope } from "@/lib/analytics/scope-types";

const PAYMENTS = "/dashboard/payments/all";
const ORDERS = "/dashboard/orders";
const INQUIRIES = "/dashboard/inquiries";

/**
 * `org` is omitted when it adds nothing: all franchises, or the viewer's whole visible set.
 * A restricted scope with no orgs serializes as "none" (never an empty value, which would widen).
 */
function orgParam(scope: AnalyticsScope): string | null {
  if (scope.orgIds === "all") return null;
  const { visible } = scope;
  const sameAsVisible =
    visible !== "all" &&
    scope.orgIds.length === visible.length &&
    scope.orgIds.every((id) => visible.includes(id));
  if (sameAsVisible) return null;
  return scope.orgIds.length ? scope.orgIds.join(",") : "none";
}

function withScope(qs: URLSearchParams, scope: AnalyticsScope) {
  qs.set("from", String(scope.fromMs));
  qs.set("to", String(scope.toMs));
  const org = orgParam(scope);
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
): string {
  const qs = new URLSearchParams();
  if (opts.basis) qs.set("basis", opts.basis);
  if (opts.statuses?.length) qs.set("status", opts.statuses.join(","));
  if (opts.methods?.length) qs.set("method", opts.methods.join(","));
  withScope(qs, scope);
  return withQuery(PAYMENTS, qs);
}

/**
 * Link to the Orders listing showing the rows countOrders counted. The listing's Status facet is a
 * single-value pill (a comma list would match nothing), so at most one status is allowed.
 * Pure (no db) so client components can import this file; metrics/orders.ts re-exports it.
 */
export function ordersDrillHref(scope: AnalyticsScope, extra: { status?: string[] } = {}): string {
  if ((extra.status?.length ?? 0) > 1) throw new Error("Orders links carry at most one status");
  const qs = new URLSearchParams();
  withScope(qs, scope);
  if (extra.status?.length) qs.set("status", extra.status[0]);
  if (scope.plans.length) qs.set("plan", scope.plans.join(","));
  if (scope.mealSizes.length) qs.set("mealSize", scope.mealSizes.join(","));
  if (scope.zones.length) qs.set("zone", scope.zones.join(","));
  qs.set("view", "all");
  return `${ORDERS}?${qs}`;
}

/** Carries date and franchise only; the inquiries list is not guaranteed to match lead tiles. */
export function inquiriesHref(
  scope: AnalyticsScope,
  params: { stage?: string; source?: string; owner?: string } = {},
): string {
  const qs = new URLSearchParams();
  withScope(qs, scope);
  if (params.stage) qs.set("stage", params.stage);
  if (params.source) qs.set("source", params.source);
  if (params.owner) qs.set("owner", params.owner);
  return withQuery(INQUIRIES, qs);
}
