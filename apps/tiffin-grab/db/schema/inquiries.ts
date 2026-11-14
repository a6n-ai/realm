import { baseColumns, updatableColumns } from "@foundry/database";
import { sql } from "drizzle-orm";
import { bigint, check, date, index, integer, jsonb, numeric, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { orders } from "./orders";
import { leadSources, leadSubsources } from "./lead-sources";
import { deliveryZones } from "./delivery";
import { organization } from "./organizations";
import { inquiryLostReason, renewalStatus, renewalStatusSource } from "./inquiry-enums";

export const inquiryStage = pgEnum("inquiry_stage", ["new", "contacted", "quoted", "follow_up", "converted", "lost"]);
export const inquiryActivityType = pgEnum("inquiry_activity_type", [
  "created", "note", "stage_change", "converted", "call", "whatsapp", "email",
  "quote_sent", "sample_sent", "payment_link_sent", "visit", "callback",
  // Same person reached out again (phone/email match on an open lead).
  "reinquiry",
  "renewal_started", "renewed", "reminder_sent", "reassigned", "merged",
  // Two different rows matched one contact; nothing was merged.
  "match_conflict",
]);
// Literal list: drizzle-kit loads this file, so it can't import from lib/. status-enum.test.ts keeps it in sync with SUB_STATUSES.
export const inquirySubStatus = pgEnum("inquiry_sub_status", [
  "no_response", "responded", "lost", "undeliverable", "future", "persistent",
  "expected", "pending_payment", "took_plan", "took_trial",
]);

export const inquiries = pgTable("inquiries", {
  ...updatableColumns("inq"),
  fullName: text("full_name"),
  phone: text("phone"),
  // Blank means "same as phone".
  whatsappPhone: text("whatsapp_phone"),
  email: text("email"),
  sourceId: bigint("source_id", { mode: "bigint" }).notNull().references(() => leadSources.id),
  subSourceId: bigint("sub_source_id", { mode: "bigint" }).references(() => leadSubsources.id),
  stage: inquiryStage("stage").notNull().default("new"),
  subStatus: inquirySubStatus("sub_status"),
  nextFollowUpAt: bigint("next_follow_up_at", { mode: "number" }),
  // set null: a hard-deleted user (tests; prod only soft-deletes) must not block on the leads they owned.
  currentOwner: bigint("current_owner", { mode: "bigint" }).references(() => users.id, { onDelete: "set null" }),
  convertedOrderId: bigint("converted_order_id", { mode: "bigint" }).references(() => orders.id),
  customerId: bigint("customer_id", { mode: "bigint" }).references(() => users.id, { onDelete: "set null" }),
  // The order of the open round: null = first sale; set = renewal of that order. Replaces convertedOrderId.
  currentOrderId: bigint("current_order_id", { mode: "bigint" }).references(() => orders.id, { onDelete: "set null" }),
  renewalStatus: renewalStatus("renewal_status"),
  renewalStatusSetAt: bigint("renewal_status_set_at", { mode: "number" }),
  renewalStatusSource: renewalStatusSource("renewal_status_source"),
  renewalFollowUpAt: bigint("renewal_follow_up_at", { mode: "number" }),
  renewalLostReason: inquiryLostReason("renewal_lost_reason"),
  planInterest: text("plan_interest"),
  mealSizeInterest: text("meal_size_interest"),
  personsInterest: integer("persons_interest"),
  frequencyKeyInterest: text("frequency_key_interest"),
  eatingDaysInterest: text("eating_days_interest").array(),
  postalCode: text("postal_code"),
  zoneId: bigint("zone_id", { mode: "bigint" }).references(() => deliveryZones.id),
  preferredStart: date("preferred_start"),
  quotedPrice: numeric("quoted_price", { precision: 10, scale: 2 }),
  lostReason: inquiryLostReason("lost_reason"),
  notes: text("notes"),
  // Set only when fullName was generated ("Lead <n>"); see lib/inquiries/quick-add.ts.
  leadNumber: integer("lead_number"),
  /**
   * Meta Instant Forms lead id (15–17 digits). Required for CRM → Qualified Leads
   * Conversions API matching. Set by leadgen webhook ingest or staff paste.
   */
  metaLeadId: text("meta_lead_id"),
  // Client-scoping — see orders.organizationId for the pattern. Nullable during backfill.
  organizationId: text("organization_id").references(() => organization.id),
}, (t) => [
  index("inquiries_phone_lower_idx").on(sql`lower(${t.phone})`),
  index("inquiries_email_lower_idx").on(sql`lower(${t.email})`),
  index("inquiries_owner_idx").on(t.currentOwner),
  index("inquiries_whatsapp_lower_idx").on(sql`lower(${t.whatsappPhone})`),
  uniqueIndex("inquiries_meta_lead_id_unique").on(t.metaLeadId).where(sql`${t.metaLeadId} is not null`),
  uniqueIndex("inquiries_org_lead_number_unique")
    .on(sql`coalesce(${t.organizationId}, '')`, t.leadNumber)
    .where(sql`${t.leadNumber} is not null`),
  // One open lead per person (phone or email): the DB-level half of the dedup
  // rule createOrFold enforces in app code, closing the read-then-write race.
  // Repeat contacts become `reinquiry` activities on that lead.
  uniqueIndex("inquiries_open_phone_unique")
    .on(sql`lower(${t.phone})`)
    .where(sql`${t.stage} not in ('converted', 'lost')`),
  uniqueIndex("inquiries_open_email_unique")
    .on(sql`lower(${t.email})`)
    .where(sql`${t.stage} not in ('converted', 'lost')`),
  index("inquiries_created_idx").on(t.createdAt),
  index("inquiries_organization_idx").on(t.organizationId),
  index("inquiries_stage_created_idx").on(t.stage, t.createdAt),
  index("inquiries_source_idx").on(t.sourceId),
  index("inquiries_converted_order_idx").on(t.convertedOrderId),
  index("inquiries_sub_source_idx").on(t.subSourceId),
  index("inquiries_zone_idx").on(t.zoneId),
  index("inquiries_next_follow_up_idx").on(t.nextFollowUpAt),
  index("inquiries_customer_idx").on(t.customerId),
  index("inquiries_current_order_idx").on(t.currentOrderId),
  index("inquiries_renewal_follow_up_idx").on(t.renewalFollowUpAt),
  check("inquiries_name_or_phone", sql`coalesce(nullif(trim(${t.fullName}), ''), nullif(trim(${t.phone}), '')) is not null`),
]);

export const inquiryActivities = pgTable("inquiry_activities", {
  ...baseColumns("iac"),
  inquiryId: bigint("inquiry_id", { mode: "bigint" }).notNull().references(() => inquiries.id, { onDelete: "cascade" }),
  type: inquiryActivityType("type").notNull(),
  note: text("note"),
  outcome: text("outcome"),
  amount: integer("amount"),   // minor units; currency resolved via app_id -> app.currency
  nextFollowUpAt: bigint("next_follow_up_at", { mode: "number" }),
  fromStage: inquiryStage("from_stage"),
  toStage: inquiryStage("to_stage"),
  fromSubStatus: inquirySubStatus("from_sub_status"),
  toSubStatus: inquirySubStatus("to_sub_status"),
  // The round this activity belongs to (null = first sale).
  orderId: bigint("order_id", { mode: "bigint" }).references(() => orders.id, { onDelete: "set null" }),
  lostReason: inquiryLostReason("lost_reason"),
  details: jsonb("details"),
  // Client-scoping — see orders.organizationId for the pattern. Nullable during backfill.
  organizationId: text("organization_id").references(() => organization.id),
}, (t) => [
  // Pipeline list runs a per-row "latest activity" correlated subquery
  // (inquiry_id = ? order by created_at desc limit 1) — index both columns.
  index("inquiry_activities_inquiry_created_idx").on(t.inquiryId, t.createdAt),
  index("inquiry_activities_organization_idx").on(t.organizationId),
  index("inquiry_activities_order_idx").on(t.orderId, t.createdAt),
]);
