import { updatableColumns } from "@realm/database";
import { bigint, boolean, date, integer, numeric, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { dishes, plans } from "./catalog";
import { orders } from "./orders";

// A menu slot (sabzi, rice, protein …). Which plans use a slot is explicit
// membership via categoryPlans, not the old plan_type column: plan_type could
// only split tiffin from healthy, so the veg and non-veg plans were forced to
// share one slot list. `key` is globally unique now, so a slot used by several
// plans — "salad" — is ONE row attached to each, rather than a duplicate per
// plan type whose enabled/selectable flags drift apart.
//
// tuUnitType/tuUnitSize/tuUnitLabel define this category's conversion into the
// shared "tiffin unit" (TU) — the common currency meal_size_items.tuAmount and
// swaps are denominated in, so 1 TU of roti and 1 TU of rice compare like-for-like
// without a per-swap portion table. tuUnitSize = how many of the category's
// natural unit make 1 TU (8 for an 8oz weight category, 4 for roti, 1 for rice).
// No global default for 'count' categories — there's no sane guess for "how many
// pieces is one unit", it must be set per category. 'weight' categories default
// to 8oz/TU at the UI layer; the column itself stays NOT NULL, always explicit.
export const tuUnitType = pgEnum("tu_unit_type", ["weight", "count"]);

export const dishCategories = pgTable(
  "dish_categories",
  {
    ...updatableColumns("slt"),
    key: text("key").notNull(),
    label: text("label").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    selectable: boolean("selectable").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    tuUnitType: tuUnitType("tu_unit_type").notNull().default("weight"),
    tuUnitSize: numeric("tu_unit_size", { precision: 6, scale: 2 }).notNull().default("8"),
    tuUnitLabel: text("tu_unit_label").notNull().default("oz"),
  },
  (t) => [uniqueIndex("dish_categories_key_unique").on(t.key)],
);

// Global eligibility: is (from, to) EVER allowed to swap, anywhere? A row here
// is the whole mechanism — there's no per-meal-size rule catalog any more. A
// swap always moves N picks of `from` for however many `to` picks its own
// tuAmount works out to (a flat 1 TU-for-1 TU trade, computed at apply time —
// see category-swaps.service.ts), so this table carries no ratio, only the
// short list of pairs an admin has approved.
export const categorySwapPairs = pgTable(
  "category_swap_pairs",
  {
    ...updatableColumns("csp"),
    fromCategoryId: bigint("from_category_id", { mode: "bigint" })
      .notNull()
      .references(() => dishCategories.id, { onDelete: "cascade" }),
    toCategoryId: bigint("to_category_id", { mode: "bigint" })
      .notNull()
      .references(() => dishCategories.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("category_swap_pairs_pair_unique").on(t.fromCategoryId, t.toCategoryId)],
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

// draft   — the admin's working copy; content is editable, invisible to the public.
// ready   — saved and content-frozen for review; still not on the website.
// released — live and orderable. Editing one requires an explicit amend, because live
//            orders already hold meal_selections against its items.
export const menuWeekStatus = pgEnum("menu_week_status", ["draft", "ready", "released"]);
export const dayOfWeek = pgEnum("day_of_week", ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

/**
 * One menu week per week_start, for every plan.
 *
 * plan_type used to split this table, which made it the last surviving second answer to
 * "who may be served this dish" — dishes and categories had already moved to explicit
 * membership (dishPlans, categoryPlans). The readers disagreed as a result. Now a week is
 * simply the week, and membership alone decides what each subscriber is offered.
 */
export const menuWeeks = pgTable(
  "menu_weeks",
  {
    ...updatableColumns("mnw"),
    weekStart: date("week_start").notNull(),
    status: menuWeekStatus("status").notNull().default("draft"),
    orderCutoff: bigint("order_cutoff", { mode: "number" }).notNull(),
    releasedAt: bigint("released_at", { mode: "number" }),
  },
  (t) => [uniqueIndex("menu_weeks_week_unique").on(t.weekStart)],
);

export const menuItems = pgTable(
  "menu_items",
  {
    ...updatableColumns("mni"),
    menuWeekId: bigint("menu_week_id", { mode: "bigint" }).notNull().references(() => menuWeeks.id, { onDelete: "cascade" }),
    dayOfWeek: dayOfWeek("day_of_week").notNull(),
    // Was a free-text `slot` holding a category key. Nothing enforced the reference, so a
    // renamed key orphaned every row that used it — and the seed shipped items pointing at
    // 'lunch', which was never a category. RESTRICT because dishCategories.delete() already
    // soft-deletes via `enabled`; a hard delete of a category still on a menu must fail.
    categoryId: bigint("category_id", { mode: "bigint" })
      .notNull()
      .references(() => dishCategories.id, { onDelete: "restrict" }),
    dishId: bigint("dish_id", { mode: "bigint" }).notNull().references(() => dishes.id),
    isDefault: boolean("is_default").notNull().default(false),
    position: integer("position").notNull().default(0),
  },
  (t) => [uniqueIndex("menu_items_unique").on(t.menuWeekId, t.dayOfWeek, t.categoryId, t.dishId)],
);

export const mealSelections = pgTable(
  "meal_selections",
  {
    ...updatableColumns("msl"),
    orderId: bigint("order_id", { mode: "bigint" }).notNull().references(() => orders.id, { onDelete: "cascade" }),
    menuWeekId: bigint("menu_week_id", { mode: "bigint" }).notNull().references(() => menuWeeks.id),
    dayOfWeek: dayOfWeek("day_of_week").notNull(),
    categoryId: bigint("category_id", { mode: "bigint" })
      .notNull()
      .references(() => dishCategories.id, { onDelete: "restrict" }),
    personIndex: integer("person_index").notNull(),
    pickIndex: integer("pick_index").notNull().default(1),
    dishId: bigint("dish_id", { mode: "bigint" }).notNull().references(() => dishes.id),
  },
  (t) => [
    uniqueIndex("meal_selections_unique").on(
      t.orderId,
      t.menuWeekId,
      t.dayOfWeek,
      t.categoryId,
      t.personIndex,
      t.pickIndex,
    ),
  ],
);
