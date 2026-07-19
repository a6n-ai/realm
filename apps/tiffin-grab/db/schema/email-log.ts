import { baseColumns } from "@realm/database";
import { index, pgEnum, pgTable, text } from "drizzle-orm/pg-core";

export const emailStatus = pgEnum("email_status", ["sent", "failed"]);

/**
 * One row per outbound email — the single record of every send, auth and
 * notification alike, written at the getEmailProvider chokepoint. Independent of
 * the notification outbox (which only covers template channels).
 */
export const emailLog = pgTable(
  "email_log",
  {
    ...baseColumns("eml"),
    recipient: text("recipient").notNull(),
    subject: text("subject").notNull(),
    status: emailStatus("status").notNull(),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
  },
  (t) => [index("email_log_created_idx").on(t.createdAt)],
);
