import { baseColumns, updatableColumns } from "@realm/database";
import {
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  type PgEnum,
} from "drizzle-orm/pg-core";
import { notificationChannel } from "./schema";

export const campaignStatus = pgEnum("campaign_status", [
  "draft", "scheduled", "sending", "sent", "paused", "cancelled",
]);

/**
 * How consent for an address was obtained. CASL treats implied consent from a
 * purchase as expiring after 24 months, so the source and date must both be
 * stored — a boolean cannot answer "is this consent still valid today?".
 */
export const consentSource = pgEnum("consent_source", [
  "purchase", "express_optin", "event_signup", "import_other",
]);

export interface AudienceDef {
  /** Filter over the app's own customer data. Undefined = lists only. */
  segment?: {
    lastOrderAfter?: number;
    lastOrderBefore?: number;
    minOrderCount?: number;
    minTotalSpend?: number;
    /** Plan D: marketing to an unverified number reaches a stranger. */
    requireVerifiedPhone?: boolean;
  };
  /** contact_list public ids to union in. */
  listIds?: string[];
}

export function makeCampaignTables<L extends [string, ...string[]]>(deps: { locale: PgEnum<L> }) {
  const { locale } = deps;

  const campaign = pgTable("campaign", {
    ...updatableColumns("cmp"),
    name: text("name").notNull(),
    /** Channels this campaign targets; each recipient still passes through prefs. */
    channels: notificationChannel("channels").array().notNull(),
    audience: jsonb("audience").$type<AudienceDef>().notNull(),
    status: campaignStatus("status").notNull().default("draft"),
    scheduledAt: bigint("scheduled_at", { mode: "number" }),
    sentAt: bigint("sent_at", { mode: "number" }),
    /** { queued, sent, failed, delivered, opened, clicked, bounced, unsubscribed } */
    counts: jsonb("counts").$type<Record<string, number>>().notNull().default({}),
  }, (t) => [
    // Scheduler poll: due campaigns are (status, scheduled_at) lookups.
    index("campaign_status_scheduled_idx").on(t.status, t.scheduledAt),
  ]);

  /** Same shape as notification_template, keyed on a campaign instead of an event. */
  const campaignContent = pgTable("campaign_content", {
    ...updatableColumns("cmc"),
    campaignId: bigint("campaign_id", { mode: "bigint" }).notNull().references(() => campaign.id),
    channel: notificationChannel("channel").notNull(),
    locale: locale("locale").notNull(),
    subject: text("subject").notNull(),
    body: text("body"),
    html: text("html"),
    text: text("text"),
    providerTemplateId: text("provider_template_id"),
  }, (t) => [
    uniqueIndex("campaign_content_key_idx").on(t.campaignId, t.channel, t.locale),
  ]);

  /**
   * An uploaded list. Consent provenance is NOT NULL by design: an imported
   * list has no consent record unless one is supplied, and mailing a purchased
   * or scraped list is not permitted. Making the column nullable would make the
   * unlawful case the path of least resistance.
   */
  const contactList = pgTable("contact_list", {
    ...updatableColumns("ctl"),
    name: text("name").notNull(),
    consentSource: consentSource("consent_source").notNull(),
    consentAt: bigint("consent_at", { mode: "number" }).notNull(),
    consentNote: text("consent_note"),
    memberCount: integer("member_count").notNull().default(0),
    /** Set when the list was built from a segment (min orders/spend/etc), enabling resync. */
    segmentDef: jsonb("segment_def").$type<Record<string, unknown>>(),
  });

  const contactListMember = pgTable("contact_list_member", {
    ...baseColumns("clm"),
    listId: bigint("list_id", { mode: "bigint" }).notNull().references(() => contactList.id),
    email: text("email"),
    phone: text("phone"),
    name: text("name"),
    /** Merge fields lifted from the CSV's extra columns. */
    vars: jsonb("vars").$type<Record<string, string>>().notNull().default({}),
    unsubscribedAt: bigint("unsubscribed_at", { mode: "number" }),
  }, (t) => [
    uniqueIndex("contact_list_member_email_idx").on(t.listId, t.email),
    uniqueIndex("contact_list_member_phone_idx").on(t.listId, t.phone),
  ]);

  return { campaignStatus, consentSource, campaign, campaignContent, contactList, contactListMember };
}

export type CampaignTables = ReturnType<typeof makeCampaignTables>;
