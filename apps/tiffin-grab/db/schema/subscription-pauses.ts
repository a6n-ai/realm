import { baseColumns } from "@realm/database";
import { sql } from "drizzle-orm";
import { bigint, boolean, date, index, pgTable, timestamp } from "drizzle-orm/pg-core";
import { orders } from "./orders";
import { users } from "./auth";

// One row per pause action. resumedAt IS NULL == the single "open" pause that the
// one-active-pause guard and the auto-resume flip both key off of.
export const subscriptionPauses = pgTable("subscription_pauses", {
  ...baseColumns("pse"),
  orderId: bigint("order_id", { mode: "bigint" }).notNull().references(() => orders.id, { onDelete: "cascade" }),
  fromDate: date("from_date").notNull(),
  untilDate: date("until_date").notNull(),
  isIndefinite: boolean("is_indefinite").notNull().default(false),
  resumedAt: timestamp("resumed_at", { withTimezone: true }),
  resumedBy: bigint("resumed_by", { mode: "bigint" }).references(() => users.id),
}, (t) => [
  index("subscription_pauses_order_idx").on(t.orderId),
  // Partial index backs the one-open-pause guard.
  index("subscription_pauses_open_idx").on(t.orderId).where(sql`resumed_at is null`),
]);
