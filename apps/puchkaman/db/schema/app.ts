import { updatableColumns } from "@realm/database";
import { pgTable, text } from "drizzle-orm/pg-core";

// The app/tenant singleton: one row. current_app_id() (in the baseline
// migration) resolves every other table's app_id FK through this row.
export const app = pgTable("app", {
  ...updatableColumns("aps"),
  timezone: text("timezone").notNull().default("America/Toronto"),
  currency: text("currency").notNull().default("CAD"),
});
