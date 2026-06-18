import { baseColumns, updatableColumns } from "@tiffin/commons-drizzle";
import { boolean, integer, jsonb, numeric, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { deliveryFrequencies, deliveryZones, mealSizes, plans } from "./catalog";
import { users } from "./auth";

export const subscriptionStatus = pgEnum("subscription_status", ["pending", "active", "waitlisted", "cancelled"]);
export const paymentStatus = pgEnum("payment_status", ["simulated_paid"]);

export const subscriptions = pgTable("subscriptions", {
  ...updatableColumns,
  userId: uuid("user_id").references(() => users.id),
  planId: uuid("plan_id").notNull().references(() => plans.id),
  mealSizeId: uuid("meal_size_id").notNull().references(() => mealSizes.id),
  frequencyId: uuid("frequency_id").notNull().references(() => deliveryFrequencies.id),
  dailyQty: integer("daily_qty").notNull().default(1),
  includeSaturday: boolean("include_saturday").notNull().default(false),
  includeSunday: boolean("include_sunday").notNull().default(false),
  isStudent: boolean("is_student").notNull().default(false),
  durationWeeks: integer("duration_weeks").notNull(),
  pricingSnapshot: jsonb("pricing_snapshot").notNull(),
  weeklyFee: numeric("weekly_fee", { precision: 10, scale: 2 }).notNull(),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  status: subscriptionStatus("status").notNull().default("pending"),
  deploymentId: text("deployment_id").notNull().unique(),
  zoneId: uuid("zone_id").references(() => deliveryZones.id),
  fullName: text("full_name").notNull(),
  addressLine: text("address_line").notNull(),
  city: text("city").notNull(),
  postalCode: text("postal_code").notNull(),
});

export const payments = pgTable("payments", {
  ...baseColumns,
  subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id),
  status: paymentStatus("status").notNull().default("simulated_paid"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
});
