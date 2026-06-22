import { baseColumns, updatableColumns } from "@tiffin/commons-drizzle";
import { bigint, boolean, date, integer, jsonb, numeric, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { deliveryFrequencies, deliveryZones, mealSizes, plans } from "./catalog";
import { users } from "./auth";

export const orderStatus = pgEnum("order_status", ["pending", "active", "waitlisted", "cancelled", "paused"]);
export const paymentStatus = pgEnum("payment_status", ["simulated_paid"]);
export const orderActivityType = pgEnum("order_activity_type", [
  "created", "status_change", "paused", "resumed", "cancelled", "activated", "meal_pick", "note",
]);

export const orders = pgTable("orders", {
  ...updatableColumns("ord"),
  userId: bigint("user_id", { mode: "bigint" }).references(() => users.id),
  planId: bigint("plan_id", { mode: "bigint" }).notNull().references(() => plans.id),
  mealSizeId: bigint("meal_size_id", { mode: "bigint" }).notNull().references(() => mealSizes.id),
  frequencyId: bigint("frequency_id", { mode: "bigint" }).notNull().references(() => deliveryFrequencies.id),
  persons: integer("persons").notNull().default(1),
  mealSlots: text("meal_slots").array().notNull().default(["lunch"]),
  includeSaturday: boolean("include_saturday").notNull().default(false),
  includeSunday: boolean("include_sunday").notNull().default(false),
  durationWeeks: integer("duration_weeks").notNull(),
  startDate: date("start_date").notNull(),
  tiffinCount: integer("tiffin_count").notNull(),
  perTiffinPrice: numeric("per_tiffin_price", { precision: 10, scale: 2 }).notNull(),
  pricingSnapshot: jsonb("pricing_snapshot").notNull(),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  status: orderStatus("status").notNull().default("pending"),
  pausedFrom: date("paused_from"),
  pausedUntil: date("paused_until"),
  deploymentId: text("deployment_id").notNull().unique(),
  zoneId: bigint("zone_id", { mode: "bigint" }).references(() => deliveryZones.id),
  fullName: text("full_name").notNull(),
  addressLine: text("address_line").notNull(),
  city: text("city").notNull(),
  postalCode: text("postal_code").notNull(),
});

export const payments = pgTable("payments", {
  ...baseColumns("pay"),
  orderId: bigint("order_id", { mode: "bigint" }).notNull().references(() => orders.id),
  status: paymentStatus("status").notNull().default("simulated_paid"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
});

export const orderActivities = pgTable("order_activities", {
  ...baseColumns("oac"),
  orderId: bigint("order_id", { mode: "bigint" }).notNull().references(() => orders.id, { onDelete: "cascade" }),
  type: orderActivityType("type").notNull(),
  note: text("note"),
  fromStatus: orderStatus("from_status"),
  toStatus: orderStatus("to_status"),
});
