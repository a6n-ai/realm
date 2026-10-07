import { baseColumns, updatableColumns } from "@foundry/database";
import { bigint, index, jsonb, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { organization } from "./organizations";
import { bookings } from "./studio";

export const ticketStatus = pgEnum("ticket_status", [
  "open",
  "in_progress",
  "waiting_on_customer",
  "resolved",
  "closed",
]);

export const ticketCategory = pgEnum("ticket_category", [
  "booking",
  "billing",
  "account_website",
  "feedback",
  "general",
]);

export const ticketPriority = pgEnum("ticket_priority", ["low", "normal", "high", "urgent"]);
export const ticketMessageAuthor = pgEnum("ticket_message_author", ["customer", "staff", "system"]);

export const tickets = pgTable(
  "tickets",
  {
    ...updatableColumns("tkt"),
    raisedBy: bigint("raised_by", { mode: "bigint" })
      .notNull()
      .references(() => users.id),
    subject: text("subject").notNull(),
    category: ticketCategory("category").notNull(),
    // Free text (validated in lib/support/ticket-taxonomy) so taxonomy tweaks skip migrations.
    subcategory: text("subcategory"),
    status: ticketStatus("status").notNull().default("open"),
    priority: ticketPriority("priority").notNull().default("normal"),
    currentOwner: bigint("current_owner", { mode: "bigint" }).references(() => users.id),
    bookingId: bigint("booking_id", { mode: "bigint" }).references(() => bookings.id),
    closedAt: bigint("closed_at", { mode: "number" }),
    organizationId: text("organization_id").references(() => organization.id),
  },
  (t) => [
    index("tickets_raised_by_idx").on(t.raisedBy),
    index("tickets_owner_idx").on(t.currentOwner),
    index("tickets_status_idx").on(t.status),
    index("tickets_created_idx").on(t.createdAt),
    index("tickets_organization_idx").on(t.organizationId),
    index("tickets_booking_idx").on(t.bookingId),
  ],
);

export type Attachment = { path: string; thumbUrl: string; name: string };

export const ticketMessages = pgTable(
  "ticket_messages",
  {
    ...baseColumns("tms"),
    ticketId: bigint("ticket_id", { mode: "bigint" })
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    authorId: bigint("author_id", { mode: "bigint" })
      .notNull()
      .references(() => users.id),
    authorType: ticketMessageAuthor("author_type").notNull(),
    body: text("body").notNull(),
    attachments: jsonb("attachments").$type<Attachment[]>(),
    organizationId: text("organization_id").references(() => organization.id),
  },
  (t) => [
    index("ticket_messages_ticket_created_idx").on(t.ticketId, t.createdAt),
    index("ticket_messages_organization_idx").on(t.organizationId),
    index("ticket_messages_author_idx").on(t.authorId),
  ],
);
