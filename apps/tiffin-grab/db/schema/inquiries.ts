import { baseColumns, updatableColumns } from "@realm/database";
import { sql } from "drizzle-orm";
import { bigint, date, index, integer, numeric, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { orders } from "./orders";
import { leadSources, leadSubsources } from "./lead-sources";
import { deliveryZones } from "./catalog";

export const inquiryStage = pgEnum("inquiry_stage", ["new", "contacted", "quoted", "follow_up", "converted", "lost"]);
export const inquiryActivityType = pgEnum("inquiry_activity_type", [
  "created", "note", "stage_change", "converted", "call", "whatsapp", "email",
  "quote_sent", "sample_sent", "payment_link_sent", "visit", "callback",
]);
export const inquiryLostReason = pgEnum("inquiry_lost_reason", [
  "price", "out_of_zone", "no_response", "chose_competitor", "not_ready", "other",
]);

export const inquiries = pgTable("inquiries", {
  ...updatableColumns("inq"),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  sourceId: bigint("source_id", { mode: "bigint" }).notNull().references(() => leadSources.id),
  subSourceId: bigint("sub_source_id", { mode: "bigint" }).references(() => leadSubsources.id),
  stage: inquiryStage("stage").notNull().default("new"),
  currentOwner: bigint("current_owner", { mode: "bigint" }).references(() => users.id),
  convertedOrderId: bigint("converted_order_id", { mode: "bigint" }).references(() => orders.id),
  planInterest: text("plan_interest"),
  mealSizeInterest: text("meal_size_interest"),
  personsInterest: integer("persons_interest"),
  postalCode: text("postal_code"),
  zoneId: bigint("zone_id", { mode: "bigint" }).references(() => deliveryZones.id),
  preferredStart: date("preferred_start"),
  quotedPrice: numeric("quoted_price", { precision: 10, scale: 2 }),
  lostReason: inquiryLostReason("lost_reason"),
  notes: text("notes"),
}, (t) => [
  index("inquiries_phone_lower_idx").on(sql`lower(${t.phone})`),
  index("inquiries_email_lower_idx").on(sql`lower(${t.email})`),
  index("inquiries_owner_idx").on(t.currentOwner),
  // One open lead per (phone, source): the DB-level half of the dedup rule
  // resolveForSource enforces in app code, closing the read-then-write race.
  uniqueIndex("inquiries_open_phone_source_uq")
    .on(sql`lower(${t.phone})`, t.sourceId)
    .where(sql`${t.stage} not in ('converted', 'lost')`),
  index("inquiries_created_idx").on(t.createdAt),
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
}, (t) => [
  // Pipeline list runs a per-row "latest activity" correlated subquery
  // (inquiry_id = ? order by created_at desc limit 1) — index both columns.
  index("inquiry_activities_inquiry_created_idx").on(t.inquiryId, t.createdAt),
]);
