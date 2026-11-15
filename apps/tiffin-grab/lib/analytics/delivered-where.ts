import { and, eq, gte, lte, sql } from "drizzle-orm";
import { deliveries } from "@/db/schema";
import { WP_MIGRATED } from "@/lib/orders/wordpress-import-sql";
import { type AnalyticsScope } from "@/lib/analytics/scope-types";
import { ordersScope } from "./metrics/scope";

export function deliveredBase(scope: AnalyticsScope, from: string, to: string) {
  return [
    eq(deliveries.status, "scheduled"),
    eq(deliveries.optimoCompletionStatus, "success"),
    gte(deliveries.deliveryDate, from),
    lte(deliveries.deliveryDate, to),
    ordersScope(scope),
  ];
}

/** Delivered tiffins in a date window, WordPress-migrated orders excluded. Shared by earned revenue and food cost. */
export function deliveredWhere(scope: AnalyticsScope, from: string, to: string) {
  return and(...deliveredBase(scope, from, to), sql`not ${WP_MIGRATED}`);
}
