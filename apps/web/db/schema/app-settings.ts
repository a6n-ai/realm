import { updatableColumns } from "@tiffin/commons-drizzle";
import { integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";

// Singleton: exactly one row holds app-wide settings.
export const appSettings = pgTable("app_settings", {
  ...updatableColumns("aps"),
  timezone: text("timezone").notNull().default("America/Toronto"),
  cutoffHour: integer("cutoff_hour").notNull().default(18),
  leadAssignment: jsonb("lead_assignment"),
});
