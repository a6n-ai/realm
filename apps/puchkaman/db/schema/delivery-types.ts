import { updatableColumns } from "@realm/database";
import { boolean, integer, numeric, pgTable, text } from "drizzle-orm/pg-core";
import { organization } from "./organizations";

/** A delivery option and its rules. Operator-extensible: rows, not an enum. */
export const deliveryTypes = pgTable("delivery_types", {
  ...updatableColumns("dty"),
  /** Stable machine key, set once at creation and never edited — orders reference it. */
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  description: text("description"),
  requiresAddress: boolean("requires_address").notNull().default(true),
  requiresSchedule: boolean("requires_schedule").notNull().default(false),
  minSubtotal: numeric("min_subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
  discountPct: numeric("discount_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  // Client-scoping — see deliveryZones.organizationId for the pattern.
  organizationId: text("organization_id").references(() => organization.id),
});
