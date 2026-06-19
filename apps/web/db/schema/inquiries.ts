import { baseColumns, updatableColumns } from "@tiffin/commons-drizzle";
import { jsonb, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { orders } from "./orders";

export const inquiryStage = pgEnum("inquiry_stage", ["new", "contacted", "follow_up", "converted", "lost"]);
export const inquirySource = pgEnum("inquiry_source", ["website", "facebook", "google", "manual", "referral"]);
export const inquiryActivityType = pgEnum("inquiry_activity_type", ["created", "note", "stage_change", "converted"]);

export const inquiries = pgTable("inquiries", {
  ...updatableColumns,
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  source: inquirySource("source").notNull().default("manual"),
  stage: inquiryStage("stage").notNull().default("new"),
  assignedTo: uuid("assigned_to").references(() => users.id),
  convertedOrderId: uuid("converted_order_id").references(() => orders.id),
  prefs: jsonb("prefs"),
  notes: text("notes"),
});

export const inquiryActivities = pgTable("inquiry_activities", {
  ...baseColumns,
  inquiryId: uuid("inquiry_id").notNull().references(() => inquiries.id, { onDelete: "cascade" }),
  type: inquiryActivityType("type").notNull(),
  note: text("note"),
  fromStage: inquiryStage("from_stage"),
  toStage: inquiryStage("to_stage"),
});
