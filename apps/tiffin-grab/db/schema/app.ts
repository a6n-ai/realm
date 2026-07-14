import { updatableColumns } from "@realm/database";
import { integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import type { DiscountPolicy } from "./coupons";

// The app/tenant entity (formerly app_settings): one row today. Holds currency,
// timezone and other settings that other tables resolve through their app_id FK.
export const app = pgTable("app", {
  ...updatableColumns("aps"),
  timezone: text("timezone").notNull().default("America/Toronto"),
  cutoffHour: integer("cutoff_hour").notNull().default(18),
  currency: text("currency").notNull().default("INR"),
  // ISO 3166-1 alpha-2 country the phone-number inputs default to. NULL = derive
  // from timezone (tzToDefaultCountry) so existing rows keep their current behavior.
  defaultCountry: text("default_country"),
  leadAssignment: jsonb("lead_assignment"),
  mealTypes: jsonb("meal_types"),
  discountPolicy: jsonb("discount_policy").$type<DiscountPolicy>(),
});
