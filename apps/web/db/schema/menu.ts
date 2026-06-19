import { updatableColumns } from "@tiffin/commons-drizzle";
import { boolean, integer, pgTable, text } from "drizzle-orm/pg-core";

export const mealSlots = pgTable("meal_slots", {
  ...updatableColumns,
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});
