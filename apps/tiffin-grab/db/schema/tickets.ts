import { baseColumns, updatableColumns } from "@realm/database";
import { bigint, index, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { orders } from "./orders";

export const ticketStatus = pgEnum("ticket_status", [
  "open", "in_progress", "waiting_on_customer", "resolved", "closed",
]);
export const ticketCategory = pgEnum("ticket_category", ["order", "billing", "catering", "general"]);
export const ticketPriority = pgEnum("ticket_priority", ["low", "normal", "high", "urgent"]);
export const ticketMessageAuthor = pgEnum("ticket_message_author", ["customer", "staff", "system"]);

export const tickets = pgTable("tickets", {
  ...updatableColumns("tkt"),
  raisedBy: bigint("raised_by", { mode: "bigint" }).notNull().references(() => users.id),
  subject: text("subject").notNull(),
  category: ticketCategory("category").notNull(),
  status: ticketStatus("status").notNull().default("open"),
  priority: ticketPriority("priority").notNull().default("normal"),
  currentOwner: bigint("current_owner", { mode: "bigint" }).references(() => users.id),
  orderId: bigint("order_id", { mode: "bigint" }).references(() => orders.id),
  closedAt: bigint("closed_at", { mode: "number" }),
}, (t) => [
  index("tickets_raised_by_idx").on(t.raisedBy),
  index("tickets_owner_idx").on(t.currentOwner),
  index("tickets_status_idx").on(t.status),
]);

export const ticketMessages = pgTable("ticket_messages", {
  ...baseColumns("tms"),
  ticketId: bigint("ticket_id", { mode: "bigint" }).notNull().references(() => tickets.id, { onDelete: "cascade" }),
  authorId: bigint("author_id", { mode: "bigint" }).notNull().references(() => users.id),
  authorType: ticketMessageAuthor("author_type").notNull(),
  body: text("body").notNull(),
}, (t) => [
  // Thread reads + the latest-message correlated subquery both key on
  // (ticket_id, created_at) — same shape as inquiry_activities.
  index("ticket_messages_ticket_created_idx").on(t.ticketId, t.createdAt),
]);
