import { like, sql } from "drizzle-orm";
import { orders, payments } from "@/db/schema";
import { CAPTURED } from "@/lib/analytics/revenue";
import { WP_PREFIX } from "./wordpress-import";

/** SQL twin of `isWordpressImport`. */
export const wordpressImportSql = like(orders.deploymentId, `${WP_PREFIX}%`);

const capturedList = sql.join(CAPTURED.map((s) => sql`${s}`), sql`, `);

/**
 * Narrower than `wordpressImportSql`: carries the `wordpress` pricingSnapshot key AND has no captured
 * PLAN payment (an add-on payment alone does not count). It was paid on the old site and has no price here.
 * Analytics only; everything else asks "was it imported" via `isWordpressImport` / `wordpressImportSql`.
 */
export const WP_MIGRATED = sql`(jsonb_exists(${orders.pricingSnapshot}, 'wordpress') and not exists (
  select 1 from ${payments} where ${payments.orderId} = ${orders.id}
  and ${payments.status}::text in (${capturedList}) and ${payments.addonRequest} is null
))`;
