import { pgTable, serial, text, boolean, integer, numeric } from "drizzle-orm/pg-core";
import { organization } from "@foundry/database"; // adjust path if needed

export const deliveryStrategies = pgTable("delivery_strategies", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  description: text("description"),
  requiresAddress: boolean("requires_address").notNull().default(false),
  requiresSchedule: boolean("requires_schedule").notNull().default(false),
  minSubtotal: numeric("min_subtotal", { precision: 10, scale: 2 }).default("0"),
  discountPct: numeric("discount_pct", { precision: 5, scale: 2 }).default("0"),
  sortOrder: integer("sort_order").default(0),
  active: boolean("active").notNull().default(true),
  organizationId: integer("organization_id").references(() => organization.id),
});

// Backward‑compatible alias – kept for a smooth transition.
export const deliveryTypes = deliveryStrategies;
