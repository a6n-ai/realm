import { updatableColumns } from "@realm/database";
import { bigint, boolean, pgTable, text } from "drizzle-orm/pg-core";

import { organization } from "./organizations";

/**
 * Clover merchant customers (Customer Directory) — distinct from `users`,
 * which is our own app account table (signs in at /me, no Clover ties). A
 * person can exist in both, unrelated: a Clover customer record only tracks
 * what the merchant's own Register/Directory holds, not an app login.
 * Pull-synced from Platform `/v3/merchants/{mId}/customers`.
 */
export const cloverCustomers = pgTable("clover_customers", {
  ...updatableColumns("ccu"),
  name: text("name").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  marketingAllowed: boolean("marketing_allowed").notNull().default(false),
  /** Epoch ms Clover reports as when this customer was first known. */
  customerSince: bigint("customer_since", { mode: "number" }),
  cloverCustomerId: text("clover_customer_id").unique(),
  cloverLastSyncedAt: bigint("clover_last_synced_at", { mode: "number" }),
  // Client-scoping — which location's Clover this customer was synced from.
  // See db/schema/organizations.ts.
  organizationId: text("organization_id").references(() => organization.id),
});
