import "server-only";
import { sql } from "drizzle-orm";
import { and, between, inList, type Condition } from "@foundry/commons/model/condition";
import { db } from "@/db/client";
import { orders } from "@/db/schema";
import { ordersListWhere } from "@/lib/services/orders.service";
import type { AnalyticsScope } from "./scope";

// Server-safe plain TS: no db import. Shared by the Orders page and analytics drill links.
export const ORDER_FACET_FIELDS = ["status", "plan", "tier", "mealSize", "zone", "org", "createdAt"] as const;
export type OrderFacetField = (typeof ORDER_FACET_FIELDS)[number];

type Extra = { status?: string[] };

/** The Condition the Orders listing parses from the same URL. Org narrowing is the listing's `visible` argument (scope.orgIds). */
export function scopeToOrdersCondition(scope: AnalyticsScope, extra: Extra = {}): Condition {
  const parts: Condition[] = [between("createdAt", scope.fromMs, scope.toMs)];
  if (extra.status?.length) parts.push(inList("status", extra.status));
  if (scope.plans.length) parts.push(inList("plan", scope.plans));
  if (scope.mealSizes.length) parts.push(inList("mealSize", scope.mealSizes));
  if (scope.zones.length) parts.push(inList("zone", scope.zones));
  return and(...parts);
}

const noOrgs = (scope: AnalyticsScope) => scope.orgIds !== "all" && scope.orgIds.length === 0;

/** Same where as listOrdersPage, so this equals the listing's total. */
export async function countOrders(scope: AnalyticsScope, extra: Extra = {}): Promise<number> {
  if (noOrgs(scope)) return 0;
  const [{ n }] = await db
    .select({ n: sql<number>`cast(count(*) as int)` })
    .from(orders)
    .where(ordersListWhere(scopeToOrdersCondition(scope, extra), scope.orgIds));
  return n;
}

export async function countCustomers(scope: AnalyticsScope, extra: Extra = {}): Promise<number> {
  if (noOrgs(scope)) return 0;
  const [{ n }] = await db
    .select({ n: sql<number>`cast(count(distinct ${orders.userId}) as int)` })
    .from(orders)
    .where(ordersListWhere(scopeToOrdersCondition(scope, extra), scope.orgIds));
  return n;
}

/** Link to the Orders listing showing the rows countOrders counted. */
export function ordersDrillHref(scope: AnalyticsScope, extra: Extra = {}): string {
  const p = new URLSearchParams();
  p.set("from", String(scope.fromMs));
  p.set("to", String(scope.toMs));
  if (scope.orgIds !== "all") p.set("org", scope.orgIds.length ? scope.orgIds.join(",") : "none");
  if (extra.status?.length) p.set("status", extra.status.join(","));
  if (scope.plans.length) p.set("plan", scope.plans.join(","));
  if (scope.mealSizes.length) p.set("mealSize", scope.mealSizes.join(","));
  if (scope.zones.length) p.set("zone", scope.zones.join(","));
  p.set("view", "all");
  return `/dashboard/orders?${p}`;
}
