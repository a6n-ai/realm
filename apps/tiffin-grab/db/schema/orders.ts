import { baseColumns, updatableColumns } from "@realm/database";
import { bigint, boolean, date, index, integer, jsonb, numeric, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { deliveryFrequencies, deliveryZones, mealSizes, plans } from "./catalog";
import { users } from "./auth";

export const orderStatus = pgEnum("order_status", ["pending", "active", "waitlisted", "cancelled", "paused", "completed"]);
// Additive: 'simulated_paid' stays the default; 'pending' / 'refunded' added for manual capture.
export const paymentStatus = pgEnum("payment_status", ["simulated_paid", "pending", "refunded"]);
export const paymentMethod = pgEnum("payment_method", ["simulated", "cash", "etransfer", "manual"]);
export const orderActivityType = pgEnum("order_activity_type", [
  "created", "status_change", "paused", "resumed", "cancelled", "activated", "meal_pick", "note",
  "skipped", "unskipped", "delivery_address_changed", "pool_scheduled",
]);

export const orders = pgTable("orders", {
  ...updatableColumns("ord"),
  userId: bigint("user_id", { mode: "bigint" }).references(() => users.id),
  currentOwner: bigint("current_owner", { mode: "bigint" }).references(() => users.id),
  planId: bigint("plan_id", { mode: "bigint" }).notNull().references(() => plans.id),
  mealSizeId: bigint("meal_size_id", { mode: "bigint" }).notNull().references(() => mealSizes.id),
  frequencyId: bigint("frequency_id", { mode: "bigint" }).notNull().references(() => deliveryFrequencies.id),
  persons: integer("persons").notNull().default(1),
  mealSlots: text("meal_slots").array().notNull().default(["lunch"]),
  // Snapshot of per-category counts from the chosen meal size at checkout (immutable).
  categoryCounts: jsonb("category_counts").$type<Record<string, number>>().notNull().default({}),
  includeSaturday: boolean("include_saturday").notNull().default(false),
  includeSunday: boolean("include_sunday").notNull().default(false),
  durationWeeks: integer("duration_weeks").notNull(),
  startDate: date("start_date").notNull(),
  tiffinCount: integer("tiffin_count").notNull(),
  // Tiffins owed but not yet placed on a calendar date (post-cutoff skip/vacation misses).
  // Customer schedules these after the last delivery via scheduleFromPool.
  pooledTiffinCount: integer("pooled_tiffin_count").notNull().default(0),
  perTiffinPrice: numeric("per_tiffin_price", { precision: 10, scale: 2 }).notNull(),
  pricingSnapshot: jsonb("pricing_snapshot").notNull(),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  status: orderStatus("status").notNull().default("pending"),
  deploymentId: text("deployment_id").notNull().unique(),
  zoneId: bigint("zone_id", { mode: "bigint" }).references(() => deliveryZones.id),
  fullName: text("full_name").notNull(),
  addressLine: text("address_line").notNull(),
  city: text("city").notNull(),
  postalCode: text("postal_code").notNull(),
}, (t) => [
  // Customer 360 + lists filter user_id and sort created_at desc.
  index("orders_user_created_idx").on(t.userId, t.createdAt),
  // Reassignment: staff "my queue" views filter by current_owner.
  index("orders_current_owner_idx").on(t.currentOwner),
]);

export const payments = pgTable("payments", {
  ...baseColumns("pay"),
  orderId: bigint("order_id", { mode: "bigint" }).notNull().references(() => orders.id),
  status: paymentStatus("status").notNull().default("simulated_paid"),
  method: paymentMethod("method").notNull().default("simulated"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  capturedAt: bigint("captured_at", { mode: "number" }),
  note: text("note"),
}, (t) => [
  index("payments_order_idx").on(t.orderId),
]);

export const orderActivities = pgTable("order_activities", {
  ...baseColumns("oac"),
  orderId: bigint("order_id", { mode: "bigint" }).notNull().references(() => orders.id, { onDelete: "cascade" }),
  type: orderActivityType("type").notNull(),
  note: text("note"),
  fromStatus: orderStatus("from_status"),
  toStatus: orderStatus("to_status"),
  // Plain bigint, no .references(): a TS-level reference would cycle orders -> deliveries -> orders.
  // FK added in raw SQL in the migration.
  deliveryId: bigint("delivery_id", { mode: "bigint" }),
}, (t) => [
  index("order_activities_order_created_idx").on(t.orderId, t.createdAt),
]);
