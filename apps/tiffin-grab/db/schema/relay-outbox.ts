import { baseColumns } from "@foundry/database";
import { sql } from "drizzle-orm";
import { bigint, index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { appEvent } from "./wallet";

// Email waiting to be handed to Relay. Written in the business transaction, forwarded after commit (lib/relay/forward.ts).
export const relayOutbox = pgTable("relay_outbox", {
  ...baseColumns("rob"),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()).$onUpdate(() => Date.now()),
  // Dedupe key plus ":email". Relay dedupes on it, so a retry after a lost reply cannot send twice.
  idempotencyKey: text("idempotency_key").notNull().unique(),
  event: appEvent("event"),
  recipientId: bigint("recipient_id", { mode: "bigint" }).references(() => users.id),
  recipientEmail: text("recipient_email").notNull(),
  stream: text("stream").notNull(),
  // Render input: { event, locale, vars, title, body, href }. Rendered at forward time, not enqueue time.
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: bigint("next_attempt_at", { mode: "number" }).notNull(),
  lastError: text("last_error"),
  relayMessageId: text("relay_message_id"),
  sentAt: bigint("sent_at", { mode: "number" }),
}, (t) => [
  index("relay_outbox_due_idx").on(t.nextAttemptAt).where(sql`${t.status} = 'pending'`),
  index("relay_outbox_key_prefix_idx").on(t.idempotencyKey.op("text_pattern_ops")),
  index("relay_outbox_recipient_idx").on(t.recipientId, t.createdAt),
]);
