import { baseColumns, updatableColumns } from "@foundry/database";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  type AnyPgTable,
} from "drizzle-orm/pg-core";
import {
  messageKind,
  notificationChannel,
  outboxStatus,
  suppressionScope,
} from "./schema";

/**
 * Notification tables for Relay (multi-tenant product DB).
 *
 * Recipients are tenant-scoped identities — email / phone / externalUserId —
 * not operator `users`. Event names are strings per tenant, not a shared enum.
 */
export function makeTenantNotificationTables(deps: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tenants: AnyPgTable & { id: any };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  campaign?: any;
}) {
  const tenantId = () => deps.tenants.id;

  const notifications = pgTable("notifications", {
    ...baseColumns("ntf"),
    tenantId: bigint("tenant_id", { mode: "bigint" }).notNull().references(tenantId),
    /** Caller's user id; not a Relay operator. */
    externalUserId: text("external_user_id"),
    event: text("event"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    href: text("href"),
    readAt: bigint("read_at", { mode: "number" }),
  }, (t) => [
    index("notifications_tenant_created_idx").on(t.tenantId, t.createdAt),
  ]);

  const notificationOutbox = pgTable("notification_outbox", {
    ...updatableColumns("nob"),
    tenantId: bigint("tenant_id", { mode: "bigint" }).notNull().references(tenantId),
    recipientId: bigint("recipient_id", { mode: "bigint" }),
    recipientExternalId: text("recipient_external_id"),
    recipientEmail: text("recipient_email"),
    recipientPhone: text("recipient_phone"),
    channel: notificationChannel("channel").notNull(),
    kind: messageKind("kind").notNull().default("transactional"),
    event: text("event"),
    campaignId: deps.campaign
      ? bigint("campaign_id", { mode: "bigint" }).references(() => deps.campaign.id)
      : bigint("campaign_id", { mode: "bigint" }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: outboxStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: bigint("next_attempt_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
    lastError: text("last_error"),
    providerMessageId: text("provider_message_id"),
    dedupeKey: text("dedupe_key"),
  }, (t) => [
    index("notification_outbox_due_idx").on(t.kind, t.status, t.nextAttemptAt),
    index("notification_outbox_tenant_idx").on(t.tenantId, t.status),
    uniqueIndex("notification_outbox_dedupe_idx").on(t.dedupeKey),
  ]);

  const notificationPrefs = pgTable("notification_prefs", {
    ...updatableColumns("npr"),
    tenantId: bigint("tenant_id", { mode: "bigint" }).notNull().references(tenantId),
    externalUserId: text("external_user_id").notNull(),
    channel: notificationChannel("channel").notNull(),
    kind: messageKind("kind").notNull().default("transactional"),
    enabled: boolean("enabled").notNull().default(true),
    consentSource: text("consent_source"),
    consentAt: bigint("consent_at", { mode: "number" }),
  }, (t) => [
    uniqueIndex("notification_prefs_tenant_ext_channel_kind_idx").on(
      t.tenantId, t.externalUserId, t.channel, t.kind,
    ),
  ]);

  const messageSuppression = pgTable("message_suppression", {
    ...baseColumns("msp"),
    tenantId: bigint("tenant_id", { mode: "bigint" }).notNull().references(tenantId),
    address: text("address").notNull(),
    channel: notificationChannel("channel").notNull(),
    scope: suppressionScope("scope").notNull().default("all"),
    reason: text("reason").notNull(),
  }, (t) => [
    uniqueIndex("message_suppression_tenant_address_channel_scope_idx").on(
      t.tenantId, t.address, t.channel, t.scope,
    ),
  ]);

  const notificationTemplate = pgTable("notification_template", {
    ...updatableColumns("ntp"),
    tenantId: bigint("tenant_id", { mode: "bigint" }).notNull().references(tenantId),
    event: text("event").notNull(),
    channel: notificationChannel("channel").notNull(),
    locale: text("locale").notNull().default("en"),
    subject: text("subject").notNull(),
    body: text("body"),
    html: text("html"),
    text: text("text"),
    providerTemplateId: text("provider_template_id"),
    enabled: boolean("enabled").notNull().default(true),
  }, (t) => [
    uniqueIndex("notification_template_tenant_key_idx").on(t.tenantId, t.event, t.channel, t.locale),
  ]);

  return {
    notificationChannel, outboxStatus, messageKind, suppressionScope,
    notifications, notificationOutbox, notificationPrefs,
    notificationTemplate, messageSuppression,
  };
}

export type TenantNotificationTables = ReturnType<typeof makeTenantNotificationTables>;
