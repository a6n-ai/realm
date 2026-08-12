import { baseColumns, updatableColumns } from "@realm/database";
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
  type AnyPgTable,
  type PgEnum,
} from "drizzle-orm/pg-core";

/** Delivery channels. email + in_app have handlers; sms/whatsapp are declared for later. */
export const notificationChannel = pgEnum("notification_channel", [
  "email", "in_app", "sms", "whatsapp",
]);

export const outboxStatus = pgEnum("notification_outbox_status", [
  "pending", "processing", "sent", "failed",
]);

/** Consent regime. Drives drain priority, opt-out scope and unsubscribe obligations. */
export const messageKind = pgEnum("message_kind", ["transactional", "marketing"]);

/** How far a suppression reaches. See messageSuppression for why this is not a boolean. */
export const suppressionScope = pgEnum("suppression_scope", ["all", "marketing"]);

/**
 * Build the notification tables against one app's `users` table and event enum.
 *
 * The tables cannot be shared as values: they FK to `users.id` and use a per-app
 * `app_event` enum (tiffin-grab has 18 subscription events, puchkaman has pickup
 * and delivery ones). Each app calls this from its own schema barrel and
 * re-exports, so drizzle-kit generates that app's migration — the same approach
 * `@realm/google-reviews` uses for `review_nudges`.
 */
export function makeNotificationTables<
  E extends [string, ...string[]],
  L extends [string, ...string[]],
>(deps: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  users: AnyPgTable & { id: any };
  appEvent: PgEnum<E>;
  locale: PgEnum<L>;
  /** Supplied once campaign tables exist (Plan C); omitted, campaign_id carries no FK. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  campaign?: any;
}) {
  const { users, appEvent, locale } = deps;
  const userId = () => users.id;

  /** In-app feed — the materialized notification a user sees. */
  const notifications = pgTable("notifications", {
    ...baseColumns("ntf"),
    userId: bigint("user_id", { mode: "bigint" }).notNull().references(userId),
    // Null for a campaign notification, which has no business event.
    event: appEvent("event"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    /** Optional deep-link target, e.g. "/orders/ord_123". */
    href: text("href"),
    readAt: bigint("read_at", { mode: "number" }),
  }, (t) => [
    index("notifications_user_created_idx").on(t.userId, t.createdAt),
  ]);

  /**
   * Transactional outbox — one row per (recipient, channel) so each delivery
   * retries independently. Written in the SAME txn as the business change.
   *
   * The recipient is EITHER a user id OR a literal address: imported contacts
   * have no user row, and provisioning one for every uploaded CSV line would
   * pollute the users table and the permission model.
   */
  const notificationOutbox = pgTable("notification_outbox", {
    ...updatableColumns("nob"),
    recipientId: bigint("recipient_id", { mode: "bigint" }).references(userId),
    recipientEmail: text("recipient_email"),
    recipientPhone: text("recipient_phone"),
    channel: notificationChannel("channel").notNull(),
    kind: messageKind("kind").notNull().default("transactional"),
    event: appEvent("event"),
    campaignId: deps.campaign
      ? bigint("campaign_id", { mode: "bigint" }).references(() => deps.campaign.id)
      : bigint("campaign_id", { mode: "bigint" }),
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
    // Drain claim: transactional first, then oldest-due. A 4k-recipient campaign
    // must never sit ahead of an order receipt queued a second later.
    index("notification_outbox_due_idx").on(t.kind, t.status, t.nextAttemptAt),
    index("notification_outbox_campaign_idx").on(t.campaignId, t.status),
    uniqueIndex("notification_outbox_dedupe_idx").on(t.dedupeKey),
  ]);

  /**
   * Per-user, per-channel, per-kind preference. `enabled` is the user's opt-in.
   * Suppression is NOT here — see messageSuppression.
   */
  const notificationPrefs = pgTable("notification_prefs", {
    ...updatableColumns("npr"),
    userId: bigint("user_id", { mode: "bigint" }).notNull().references(userId),
    channel: notificationChannel("channel").notNull(),
    kind: messageKind("kind").notNull().default("transactional"),
    enabled: boolean("enabled").notNull().default(true),
    /** CASL: implied consent from a purchase expires, so the source and date must be provable. */
    consentSource: text("consent_source"),
    consentAt: bigint("consent_at", { mode: "number" }),
  }, (t) => [
    uniqueIndex("notification_prefs_user_channel_kind_idx").on(t.userId, t.channel, t.kind),
  ]);

  /**
   * Suppression is a fact about an ADDRESS, not a preference of a user: SES
   * reports a bounce for an email, a carrier reports STOP for a number, and an
   * imported contact has no user row to hang either on.
   *
   * `scope` exists because the two sources differ in reach. A hard bounce or a
   * spam complaint must stop EVERYTHING to that address. An unsubscribe must
   * stop marketing only — a receipt for an order the person actually placed is
   * still owed to them, and withholding it is the wrong kind of compliance.
   * A plain boolean would conflate the two and silently suppress receipts.
   */
  const messageSuppression = pgTable("message_suppression", {
    ...baseColumns("msp"),
    /** Normalized: lowercased email, or E.164 phone. */
    address: text("address").notNull(),
    channel: notificationChannel("channel").notNull(),
    /** "all" = bounce/complaint/STOP. "marketing" = unsubscribe. */
    scope: suppressionScope("scope").notNull().default("all"),
    /** bounce | complaint | unsubscribe | manual */
    reason: text("reason").notNull(),
  }, (t) => [
    // Non-null scope on purpose: a nullable "applies to everything" column would
    // need NULLS NOT DISTINCT for the unique index to behave.
    uniqueIndex("message_suppression_address_channel_scope_idx").on(t.address, t.channel, t.scope),
  ]);

  /**
   * Admin-authored templates, keyed by (event, channel, locale) with an `en`
   * fallback. No row → the channel is not delivered for that event.
   */
  const notificationTemplate = pgTable("notification_template", {
    ...updatableColumns("ntp"),
    event: appEvent("event").notNull(),
    channel: notificationChannel("channel").notNull(),
    locale: locale("locale").notNull(),
    subject: text("subject").notNull(),
    // in_app: markdown. email: the editor HTML (reload source for re-editing).
    body: text("body"),
    // email only: exported email-safe HTML + plaintext (pre-interpolation).
    html: text("html"),
    text: text("text"),
    /** WhatsApp / templated SMS: the provider-side pre-approved template id. */
    providerTemplateId: text("provider_template_id"),
    enabled: boolean("enabled").notNull().default(true),
  }, (t) => [
    uniqueIndex("notification_template_key_idx").on(t.event, t.channel, t.locale),
  ]);

  return {
    notificationChannel, outboxStatus, messageKind, suppressionScope,
    notifications, notificationOutbox, notificationPrefs,
    notificationTemplate, messageSuppression,
  };
}

export type NotificationTables = ReturnType<typeof makeNotificationTables>;
