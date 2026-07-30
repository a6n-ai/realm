import { updatableColumns } from "@realm/database";
import { bigint, boolean, date, integer, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { dishes, planType, plans } from "./catalog";
import { orders } from "./orders";

// A menu slot (sabzi, rice, protein …). Which plans use a slot is explicit
// membership via categoryPlans, not the old plan_type column: plan_type could
// only split tiffin from healthy, so the veg and non-veg plans were forced to
// share one slot list. `key` is globally unique now, so a slot used by several
// plans — "salad" — is ONE row attached to each, rather than a duplicate per
// plan type whose enabled/selectable flags drift apart.
export const dishCategories = pgTable(
  "dish_categories",
  {
    ...updatableColumns("slt"),
    key: text("key").notNull(),
    label: text("label").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    selectable: boolean("selectable").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("dish_categories_key_unique").on(t.key)],
);

/** Which plans a menu slot belongs to. Mirrors dishPlans. */
export const categoryPlans = pgTable(
  "category_plans",
  {
    ...updatableColumns("cpl"),
    categoryId: bigint("category_id", { mode: "bigint" })
      .notNull()
      .references(() => dishCategories.id, { onDelete: "cascade" }),
    planId: bigint("plan_id", { mode: "bigint" })
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("category_plans_category_plan_unique").on(t.categoryId, t.planId)],
);

export const menuWeekStatus = pgEnum("menu_week_status", ["draft", "released"]);
export const dayOfWeek = pgEnum("day_of_week", ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

export const menuWeeks = pgTable(
  "menu_weeks",
  {
    ...updatableColumns("mnw"),
    planType: planType("plan_type").notNull().default("tiffin"),
    weekStart: date("week_start").notNull(),
    status: menuWeekStatus("status").notNull().default("draft"),
    orderCutoff: bigint("order_cutoff", { mode: "number" }).notNull(),
    releasedAt: bigint("released_at", { mode: "number" }),
  },
  (t) => [uniqueIndex("menu_weeks_type_week_unique").on(t.planType, t.weekStart)],
);

export const menuItems = pgTable(
  "menu_items",
  {
    ...updatableColumns("mni"),
    menuWeekId: bigint("menu_week_id", { mode: "bigint" }).notNull().references(() => menuWeeks.id, { onDelete: "cascade" }),
    dayOfWeek: dayOfWeek("day_of_week").notNull(),
    // slot column now holds a category key (sabzi/rice/…), not a meal-time
    slot: text("slot").notNull(),
    dishId: bigint("dish_id", { mode: "bigint" }).notNull().references(() => dishes.id),
    isDefault: boolean("is_default").notNull().default(false),
    position: integer("position").notNull().default(0),
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
    // slot column now holds a category key (sabzi/rice/…), not a meal-time
    slot: text("slot").notNull(),
    personIndex: integer("person_index").notNull(),
    pickIndex: integer("pick_index").notNull().default(1),
    dishId: bigint("dish_id", { mode: "bigint" }).notNull().references(() => dishes.id),
  },
  (t) => [
    uniqueIndex("meal_selections_unique").on(
      t.orderId,
      t.menuWeekId,
      t.dayOfWeek,
      t.slot,
      t.personIndex,
      t.pickIndex,
    ),
  ],
);
