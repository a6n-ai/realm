import { updatableColumns } from "@tiffin/commons-drizzle";
import { bigint, boolean, date, integer, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { orders } from "./orders";

export const mealSlots = pgTable("meal_slots", {
  ...updatableColumns("slt"),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const dishDiet = pgEnum("dish_diet", ["veg", "nonveg"]);

export const dishes = pgTable("dishes", {
  ...updatableColumns("dsh"),
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
  ...updatableColumns("mnw"),
  weekStart: date("week_start").notNull().unique(),
  status: menuWeekStatus("status").notNull().default("draft"),
  orderCutoff: bigint("order_cutoff", { mode: "number" }).notNull(),
  releasedAt: bigint("released_at", { mode: "number" }),
});

export const menuItems = pgTable(
  "menu_items",
  {
    ...updatableColumns("mni"),
    menuWeekId: bigint("menu_week_id", { mode: "bigint" }).notNull().references(() => menuWeeks.id, { onDelete: "cascade" }),
    dayOfWeek: dayOfWeek("day_of_week").notNull(),
    slot: text("slot").notNull(),
    dishId: bigint("dish_id", { mode: "bigint" }).notNull().references(() => dishes.id),
    isDefault: boolean("is_default").notNull().default(false),
  },
  (t) => [uniqueIndex("menu_items_unique").on(t.menuWeekId, t.dayOfWeek, t.slot, t.dishId)],
);

export const mealSelections = pgTable(
  "meal_selections",
  {
    ...updatableColumns("msl"),
    orderId: bigint("order_id", { mode: "bigint" }).notNull().references(() => orders.id, { onDelete: "cascade" }),
    menuWeekId: bigint("menu_week_id", { mode: "bigint" }).notNull().references(() => menuWeeks.id),
    dayOfWeek: dayOfWeek("day_of_week").notNull(),
    slot: text("slot").notNull(),
    personIndex: integer("person_index").notNull(),
    dishId: bigint("dish_id", { mode: "bigint" }).notNull().references(() => dishes.id),
  },
  (t) => [uniqueIndex("meal_selections_unique").on(t.orderId, t.menuWeekId, t.dayOfWeek, t.slot, t.personIndex)],
);
