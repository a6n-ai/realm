import { updatableColumns } from "@foundry/database";
import { pgTable, text } from "drizzle-orm/pg-core";

export const app = pgTable("app", {
  ...updatableColumns("aps"),
  timezone: text("timezone").notNull().default("America/Toronto"),
  currency: text("currency").notNull().default("CAD"),
});
