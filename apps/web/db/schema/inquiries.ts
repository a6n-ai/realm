import { baseColumns, updatableColumns } from "@tiffin/commons-drizzle";
import { sql } from "drizzle-orm";
import { bigint, index, jsonb, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { orders } from "./orders";

export const inquiryStage = pgEnum("inquiry_stage", ["new", "contacted", "follow_up", "converted", "lost"]);
export const inquirySource = pgEnum("inquiry_source", ["website", "facebook", "google", "manual", "referral"]);
export const inquiryActivityType = pgEnum("inquiry_activity_type", ["created", "note", "stage_change", "converted"]);

export const inquiries = pgTable("inquiries", {
  ...updatableColumns("inq"),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  source: inquirySource("source").notNull().default("manual"),
  stage: inquiryStage("stage").notNull().default("new"),
  assignedTo: bigint("assigned_to", { mode: "bigint" }).references(() => users.id),
  convertedOrderId: bigint("converted_order_id", { mode: "bigint" }).references(() => orders.id),
  prefs: jsonb("prefs"),
  notes: text("notes"),
}, (t) => [
  index("inquiries_phone_lower_idx").on(sql`lower(${t.phone})`),
  index("inquiries_email_lower_idx").on(sql`lower(${t.email})`),
]);

export const inquiryActivities = pgTable("inquiry_activities", {
  ...baseColumns("iac"),
  inquiryId: bigint("inquiry_id", { mode: "bigint" }).notNull().references(() => inquiries.id, { onDelete: "cascade" }),
  type: inquiryActivityType("type").notNull(),
  note: text("note"),
  fromStage: inquiryStage("from_stage"),
  toStage: inquiryStage("to_stage"),
});
