import { updatableColumns } from "@realm/database";
import {
  bigint,
  boolean,
  integer,
  numeric,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { products } from "./products";

/**
 * Clover inventory SoT entities (beyond products ↔ items).
 *
 * Mapping:
 * - products              ↔ Clover items
 * - product_categories    ↔ Clover categories (Register menu sections; includes colorCode)
 * - product_category_items↔ Clover category_items (M:N)
 * - modifier_groups       ↔ Clover modifier_groups
 * - modifiers             ↔ Clover modifiers
 * - product_modifier_groups ↔ Clover item_modifier_groups (M:N)
 * - discounts             ↔ Clover discounts
 * - menus                 ↔ local Register menu layout (Clover has no separate Menus
 *                           inventory resource — sections are categories)
 * - menu_sections         ↔ ordered category membership on a menu
 */

/** Clover categories (Register sections). colorCode preserved for swatches. */
export const productCategories = pgTable("product_categories", {
  ...updatableColumns("cat"),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  /** Hex from Clover Register, e.g. #FF0080. */
  colorCode: text("color_code"),
  active: boolean("active").notNull().default(true),
  cloverCategoryId: text("clover_category_id").unique(),
  cloverParentCategoryId: text("clover_parent_category_id"),
  cloverLastSyncedAt: bigint("clover_last_synced_at", { mode: "number" }),
});

/** M:N product ↔ category (Clover category_items). */
export const productCategoryItems = pgTable(
  "product_category_items",
  {
    ...updatableColumns("pci"),
    categoryId: bigint("category_id", { mode: "bigint" })
      .notNull()
      .references(() => productCategories.id),
    productId: bigint("product_id", { mode: "bigint" })
      .notNull()
      .references(() => products.id),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("product_category_items_cat_prod_uidx").on(t.categoryId, t.productId)],
);

export const modifierGroups = pgTable("modifier_groups", {
  ...updatableColumns("mdg"),
  name: text("name").notNull(),
  alternateName: text("alternate_name"),
  minRequired: integer("min_required"),
  maxAllowed: integer("max_allowed"),
  showByDefault: boolean("show_by_default").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  cloverModifierGroupId: text("clover_modifier_group_id").unique(),
  cloverLastSyncedAt: bigint("clover_last_synced_at", { mode: "number" }),
});

export const modifiers = pgTable("modifiers", {
  ...updatableColumns("mdf"),
  modifierGroupId: bigint("modifier_group_id", { mode: "bigint" })
    .notNull()
    .references(() => modifierGroups.id),
  name: text("name").notNull(),
  alternateName: text("alternate_name"),
  /** Extra price in dollars (Clover stores cents). */
  price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
  available: boolean("available").notNull().default(true),
  active: boolean("active").notNull().default(true),
  cloverModifierId: text("clover_modifier_id").unique(),
  cloverLastSyncedAt: bigint("clover_last_synced_at", { mode: "number" }),
});

/** M:N product ↔ modifier group (Clover item_modifier_groups). */
export const productModifierGroups = pgTable(
  "product_modifier_groups",
  {
    ...updatableColumns("pmg"),
    productId: bigint("product_id", { mode: "bigint" })
      .notNull()
      .references(() => products.id),
    modifierGroupId: bigint("modifier_group_id", { mode: "bigint" })
      .notNull()
      .references(() => modifierGroups.id),
  },
  (t) => [
    uniqueIndex("product_modifier_groups_prod_group_uidx").on(t.productId, t.modifierGroupId),
  ],
);

export const discounts = pgTable("discounts", {
  ...updatableColumns("dsc"),
  name: text("name").notNull(),
  /** Fixed amount in dollars (Clover cents; often negative). */
  amount: numeric("amount", { precision: 10, scale: 2 }),
  /** Percent off 0–100. */
  percentage: numeric("percentage", { precision: 6, scale: 2 }),
  active: boolean("active").notNull().default(true),
  cloverDiscountId: text("clover_discount_id").unique(),
  cloverLastSyncedAt: bigint("clover_last_synced_at", { mode: "number" }),
});

/**
 * Local Register menu layout. Clover Inventory has no separate Menus resource —
 * Register menus are categories + category_items. Pull sync maintains a default
 * "Register" menu whose sections are synced categories.
 */
export const menus = pgTable("menus", {
  ...updatableColumns("mnu"),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  /** Reserved for future Online Ordering menus API. */
  cloverMenuId: text("clover_menu_id").unique(),
  cloverLastSyncedAt: bigint("clover_last_synced_at", { mode: "number" }),
});

export const menuSections = pgTable(
  "menu_sections",
  {
    ...updatableColumns("msc"),
    menuId: bigint("menu_id", { mode: "bigint" })
      .notNull()
      .references(() => menus.id),
    categoryId: bigint("category_id", { mode: "bigint" })
      .notNull()
      .references(() => productCategories.id),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("menu_sections_menu_cat_uidx").on(t.menuId, t.categoryId)],
);
