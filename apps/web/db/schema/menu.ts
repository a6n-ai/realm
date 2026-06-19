import { updatableColumns } from "@tiffin/commons-drizzle";
import { boolean, date, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { orders } from "./orders";

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

export const menuWeekStatus = pgEnum("menu_week_status", ["draft", "released"]);
export const dayOfWeek = pgEnum("day_of_week", ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

export const menuWeeks = pgTable("menu_weeks", {
  ...updatableColumns,
  weekStart: date("week_start").notNull().unique(),
  status: menuWeekStatus("status").notNull().default("draft"),
  orderCutoff: timestamp("order_cutoff", { withTimezone: true }).notNull(),
  releasedAt: timestamp("released_at", { withTimezone: true }),
});

export const menuItems = pgTable(
  "menu_items",
  {
    ...updatableColumns,
    menuWeekId: uuid("menu_week_id").notNull().references(() => menuWeeks.id, { onDelete: "cascade" }),
    dayOfWeek: dayOfWeek("day_of_week").notNull(),
    slot: text("slot").notNull(),
    dishId: uuid("dish_id").notNull().references(() => dishes.id),
    isDefault: boolean("is_default").notNull().default(false),
  },
  (t) => [uniqueIndex("menu_items_unique").on(t.menuWeekId, t.dayOfWeek, t.slot, t.dishId)],
);

export const mealSelections = pgTable(
  "meal_selections",
  {
    ...updatableColumns,
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    menuWeekId: uuid("menu_week_id").notNull().references(() => menuWeeks.id),
    dayOfWeek: dayOfWeek("day_of_week").notNull(),
    slot: text("slot").notNull(),
    personIndex: integer("person_index").notNull(),
    dishId: uuid("dish_id").notNull().references(() => dishes.id),
  },
  (t) => [uniqueIndex("meal_selections_unique").on(t.orderId, t.menuWeekId, t.dayOfWeek, t.slot, t.personIndex)],
);
