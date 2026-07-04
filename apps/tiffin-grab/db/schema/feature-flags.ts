import { updatableColumns } from "@realm/commons-drizzle";
import { boolean, pgTable, text } from "drizzle-orm/pg-core";

export const featureFlags = pgTable("feature_flags", {
  ...updatableColumns("flg"),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  description: text("description"),
  defaultEnabled: boolean("default_enabled").notNull().default(false),
});
