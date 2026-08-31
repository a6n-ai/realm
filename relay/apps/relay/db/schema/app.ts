import { updatableColumns } from "@foundry/database";
import { pgTable, text } from "drizzle-orm/pg-core";

/** Singleton row so baseColumns.appId defaults resolve. */
export const app = pgTable("app", {
  ...updatableColumns("aps"),
  name: text("name").notNull().default("Relay"),
  timezone: text("timezone").notNull().default("America/Toronto"),
});
