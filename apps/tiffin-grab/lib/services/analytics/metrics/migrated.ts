import "server-only";
import { sql } from "drizzle-orm";
import { orders, payments } from "@/db/schema";
import { CAPTURED } from "@/lib/analytics/revenue";

const capturedList = sql.join(CAPTURED.map((s) => sql`${s}`), sql`, `);

/**
 * Imported from WordPress and never paid for in this system: it was paid on the old site and has no price here.
 * Only a captured PLAN payment brings an order back; an add-on payment alone does not.
 */
export const WP_MIGRATED = sql`(jsonb_exists(${orders.pricingSnapshot}, 'wordpress') and not exists (
  select 1 from ${payments} where ${payments.orderId} = ${orders.id}
  and ${payments.status}::text in (${capturedList}) and ${payments.addonRequest} is null
))`;
