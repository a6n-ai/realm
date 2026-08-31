import { sql } from "drizzle-orm";
import { updatableColumns } from "@foundry/database";
import { bigint, index, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { orders } from "./orders";
import { organization } from "./organizations";
import type { CartItem } from "@/lib/cart/types";

/**
 * Server mirror of the client cart. Deliberately holds no money columns: the
 * client's line price is a display estimate that Clover re-prices at checkout,
 * so a stored subtotal would be a second, stale source of truth on a money path.
 *
 * No status enum either — active / reminded / converted are all derivable from
 * lastActivityAt, remindedAt and convertedOrderId, so the lifecycle can grow a
 * state without a migration.
 */
export const carts = pgTable("carts", {
  ...updatableColumns("crt"),
  userId: bigint("user_id", { mode: "bigint" }).references(() => users.id),
  email: text("email"),
  items: jsonb("items").$type<CartItem[]>().notNull().default(sql`'[]'::jsonb`),
  lastActivityAt: bigint("last_activity_at", { mode: "number" }).notNull(),
  remindedAt: bigint("reminded_at", { mode: "number" }),
  convertedOrderId: bigint("converted_order_id", { mode: "bigint" }).references(() => orders.id),
  // Client-scoping — null = shared, set = one org's own. See db/schema/organizations.ts.
  organizationId: text("organization_id").references(() => organization.id),
}, (t) => [
  index("carts_activity_idx").on(t.lastActivityAt),
  index("carts_organization_idx").on(t.organizationId),
]);
