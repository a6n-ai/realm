import { updatableColumns } from "@tiffin/commons-drizzle";
import { boolean, integer, pgEnum, pgTable, text } from "drizzle-orm/pg-core";

export const mealSlots = pgTable("meal_slots", {
  ...updatableColumns,
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const dishDiet = pgEnum("dish_diet", ["veg", "nonveg"]);

export const dishes = pgTable("dishes", {
  ...updatableColumns,
  name: text("name").notNull(),
  description: text("description"),
  diet: dishDiet("diet").notNull(),
  slots: text("slots").array().notNull().default([]),
  imageUrl: text("image_url"),
  active: boolean("active").notNull().default(true),
});
