import { baseColumns, updatableColumns } from "@foundry/database";
import { bigint, index, jsonb, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { orders } from "./orders";
import { organization } from "./organizations";

export const ticketStatus = pgEnum("ticket_status", [
  "open", "in_progress", "waiting_on_customer", "resolved", "closed",
]);
// "catering" is retired from the customer picker but kept in the type — historical
// rows still carry it, and Postgres cannot drop an enum value without rewriting
// every dependent column. "order" / "billing" / "general" are deliberately reused
// by the two-level taxonomy (lib/support/ticket-taxonomy.ts) so analytics stay
// continuous rather than splitting into near-duplicate buckets.
export const ticketCategory = pgEnum("ticket_category", [
  "order", "billing", "catering", "general",
  "food_meal", "delivery", "plan_subscription", "packaging", "account_website", "feedback",
]);
export const ticketPriority = pgEnum("ticket_priority", ["low", "normal", "high", "urgent"]);
export const ticketMessageAuthor = pgEnum("ticket_message_author", ["customer", "staff", "system"]);

export const tickets = pgTable("tickets", {
  ...updatableColumns("tkt"),
  raisedBy: bigint("raised_by", { mode: "bigint" }).notNull().references(() => users.id),
  subject: text("subject").notNull(),
  category: ticketCategory("category").notNull(),
  // Second taxonomy level, validated against SUBCATEGORIES for the chosen category.
  // Free text rather than an enum so taxonomy tweaks don't need a migration.
  // Nullable: tickets created before the two-level picker have no sub-category.
  subcategory: text("subcategory"),
  status: ticketStatus("status").notNull().default("open"),
  priority: ticketPriority("priority").notNull().default("normal"),
  currentOwner: bigint("current_owner", { mode: "bigint" }).references(() => users.id),
  orderId: bigint("order_id", { mode: "bigint" }).references(() => orders.id),
  closedAt: bigint("closed_at", { mode: "number" }),
  // Client-scoping — see orders.organizationId for the pattern. Nullable during backfill.
  organizationId: text("organization_id").references(() => organization.id),
}, (t) => [
  index("tickets_raised_by_idx").on(t.raisedBy),
  index("tickets_owner_idx").on(t.currentOwner),
  index("tickets_status_idx").on(t.status),
  index("tickets_created_idx").on(t.createdAt),
  index("tickets_organization_idx").on(t.organizationId),
]);

// A message may carry image attachments uploaded with the reply.
// path = secured original (token-gated read); thumbUrl = static thumbnail (public, inline).
export type Attachment = { path: string; thumbUrl: string; name: string };

export const ticketMessages = pgTable("ticket_messages", {
  ...baseColumns("tms"),
  ticketId: bigint("ticket_id", { mode: "bigint" }).notNull().references(() => tickets.id, { onDelete: "cascade" }),
  authorId: bigint("author_id", { mode: "bigint" }).notNull().references(() => users.id),
  authorType: ticketMessageAuthor("author_type").notNull(),
  body: text("body").notNull(),
  attachments: jsonb("attachments").$type<Attachment[]>(),
  // Client-scoping — see orders.organizationId for the pattern. Nullable during backfill.
  organizationId: text("organization_id").references(() => organization.id),
}, (t) => [
  // Thread reads + the latest-message correlated subquery both key on
  // (ticket_id, created_at) — same shape as inquiry_activities.
  index("ticket_messages_ticket_created_idx").on(t.ticketId, t.createdAt),
  index("ticket_messages_organization_idx").on(t.organizationId),
]);
