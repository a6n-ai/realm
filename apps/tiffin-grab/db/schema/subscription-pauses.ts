import { baseColumns } from "@realm/database";
import { sql } from "drizzle-orm";
import { bigint, boolean, date, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { orders } from "./orders";
import { users } from "./auth";
import { organization } from "./organizations";

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
  // Client-scoping — see orders.organizationId for the pattern. Nullable during backfill.
  organizationId: text("organization_id").references(() => organization.id),
}, (t) => [
  index("subscription_pauses_order_idx").on(t.orderId),
  // Partial UNIQUE index backs the one-open-pause guard at the DB level — a plain
  // index only supported app-level checks (assertPauseAllowed), which race under
  // concurrent pause requests. The unique constraint makes a second OPEN row for
  // the same order impossible, independent of any app-level TOCTOU.
  uniqueIndex("subscription_pauses_one_open_uniq").on(t.orderId).where(sql`resumed_at is null`),
  index("subscription_pauses_organization_idx").on(t.organizationId),
]);
