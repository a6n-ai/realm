import { baseColumns, updatableColumns } from "@foundry/database";
import { bigint, index, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { orders } from "./orders";
import { inquiryLostReason, renewalStatus } from "./inquiry-enums";
import { organization } from "./organizations";

export const renewalActivityType = pgEnum("renewal_activity_type", [
  "note", "call", "whatsapp", "email", "callback", "status_change", "reminder_sent",
]);

export const renewals = pgTable("renewals", {
  ...updatableColumns("rnw"),
  orderId: bigint("order_id", { mode: "bigint" }).notNull().unique().references(() => orders.id, { onDelete: "cascade" }),
  status: renewalStatus("status"),
  lostReason: inquiryLostReason("lost_reason"),
  statusSetAt: bigint("status_set_at", { mode: "number" }),
  nextFollowUpAt: bigint("next_follow_up_at", { mode: "number" }),
  // Client-scoping — see orders.organizationId for the pattern. Nullable during backfill.
  organizationId: text("organization_id").references(() => organization.id),
}, (t) => [
  index("renewals_next_follow_up_idx").on(t.nextFollowUpAt),
  index("renewals_organization_idx").on(t.organizationId),
]);

export const renewalActivities = pgTable("renewal_activities", {
  ...baseColumns("rna"),
  renewalId: bigint("renewal_id", { mode: "bigint" }).notNull().references(() => renewals.id, { onDelete: "cascade" }),
  type: renewalActivityType("type").notNull(),
  note: text("note"),
  outcome: text("outcome"),
  fromStatus: renewalStatus("from_status"),
  toStatus: renewalStatus("to_status"),
  nextFollowUpAt: bigint("next_follow_up_at", { mode: "number" }),
  // Client-scoping — see orders.organizationId for the pattern. Nullable during backfill.
  organizationId: text("organization_id").references(() => organization.id),
}, (t) => [
  index("renewal_activities_renewal_created_idx").on(t.renewalId, t.createdAt),
]);
