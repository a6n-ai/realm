import { updatableColumns } from "@realm/database";
import { boolean, numeric, pgTable, text } from "drizzle-orm/pg-core";

/**
 * One concentric ring from the shop. The largest active radius IS the delivery
 * limit — there is no separate global setting.
 */
export const deliveryZones = pgTable("delivery_zones", {
  ...updatableColumns("zon"),
  name: text("name").notNull(),
  radiusKm: numeric("radius_km", { precision: 6, scale: 2 }).notNull(),
  feeAmount: numeric("fee_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  discountPct: numeric("discount_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  minSubtotal: numeric("min_subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
  requiresScheduling: boolean("requires_scheduling").notNull().default(false),
  // Soft delete: historical orders keep a resolvable zone.
  active: boolean("active").notNull().default(true),
});
