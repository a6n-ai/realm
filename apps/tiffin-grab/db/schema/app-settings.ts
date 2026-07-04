import { updatableColumns } from "@realm/database";
import { integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import type { DiscountPolicy } from "./coupons";

export const appSettings = pgTable("app_settings", {
  ...updatableColumns("aps"),
  timezone: text("timezone").notNull().default("America/Toronto"),
  cutoffHour: integer("cutoff_hour").notNull().default(18),
  leadAssignment: jsonb("lead_assignment"),
  mealTypes: jsonb("meal_types"),
  discountPolicy: jsonb("discount_policy").$type<DiscountPolicy>(),
});
