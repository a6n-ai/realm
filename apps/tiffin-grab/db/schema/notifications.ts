import { baseColumns, updatableColumns } from "@tiffin/commons-drizzle";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { appEvent } from "./wallet";

/** Delivery channels. email + in_app ship now; sms/whatsapp are deferred. */
export const notificationChannel = pgEnum("notification_channel", [
  "email", "in_app", "sms", "whatsapp",
]);

export const outboxStatus = pgEnum("notification_outbox_status", [
  "pending", "processing", "sent", "failed",
]);

/**
 * In-app feed — the materialized notification a user sees. The in_app channel
 * writes here, then broadcasts the row over AppSync (WebSocket).
 */
export const notifications = pgTable("notifications", {
  ...baseColumns("ntf"),
  userId: bigint("user_id", { mode: "bigint" }).notNull().references(() => users.id),
  event: appEvent("event").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  /** Optional deep-link target, e.g. "/orders/ord_123". */
  href: text("href"),
  readAt: bigint("read_at", { mode: "number" }),
}, (t) => [
  // Feed read (newest first) + unread badge both key on (user_id, created_at).
  index("notifications_user_created_idx").on(t.userId, t.createdAt),
]);

/**
 * Transactional outbox — one row per (recipient, channel) so each delivery
 * retries independently. Written in the SAME txn as the business change;
 * drained by the EventBridge-scheduled Lambda.
 */
export const notificationOutbox = pgTable("notification_outbox", {
  ...updatableColumns("nob"),
  recipientId: bigint("recipient_id", { mode: "bigint" }).notNull().references(() => users.id),
  channel: notificationChannel("channel").notNull(),
  event: appEvent("event").notNull(),
  /** Render data for the template (provider-agnostic). */
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: outboxStatus("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  /** Earliest epoch-ms the drainer may (re)try this row — drives backoff. */
  nextAttemptAt: bigint("next_attempt_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  lastError: text("last_error"),
  /** Provider id (e.g. SES MessageId) once sent — bounce/complaint correlation. */
  providerMessageId: text("provider_message_id"),
  /** Optional idempotency guard: same event+channel enqueued once. */
  dedupeKey: text("dedupe_key"),
}, (t) => [
  // Drainer poll: pending/failed rows whose backoff window has opened.
  index("notification_outbox_due_idx").on(t.status, t.nextAttemptAt),
  uniqueIndex("notification_outbox_dedupe_idx").on(t.dedupeKey),
]);

/**
 * Per-user, per-channel preference + suppression. `enabled` is the user's
 * opt-in; `suppressed` is system-forced (e.g. SES hard bounce / complaint).
 */
export const notificationPrefs = pgTable("notification_prefs", {
  ...updatableColumns("npr"),
  userId: bigint("user_id", { mode: "bigint" }).notNull().references(() => users.id),
  channel: notificationChannel("channel").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  suppressed: boolean("suppressed").notNull().default(false),
  suppressedReason: text("suppressed_reason"),
}, (t) => [
  uniqueIndex("notification_prefs_user_channel_idx").on(t.userId, t.channel),
]);
