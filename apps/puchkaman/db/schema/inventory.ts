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
 * - tax_rates             ↔ Clover tax_rates
 * - product_tax_rates     ↔ Clover tax_rate_items (M:N)
 * - printer_labels        ↔ Clover tags (Register "Order printing" labels)
 * - product_printer_labels↔ Clover tag_items (M:N)
 * - menus                 ↔ Clover online-ordering menus (one per delivery channel)
 * - menu_items            ↔ a product's price on one of those menus
 * - menu_sections         ↔ ordered category membership on a menu (local layout)
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
 * Clover tax_rates. Clover expresses `rate` in 1/100000 of a percent
 * (13% → 1300000, verified against the live merchant), so we divide by 100000
 * on the way in and multiply on the way out — storing percent keeps every
 * reader from having to know the encoding.
 * Percentage and flat taxes are mutually exclusive: PARTNER_TAX rows carry
 * `taxAmount` cents with rate 0.
 */
export const taxRates = pgTable("tax_rates", {
  ...updatableColumns("tax"),
  name: text("name").notNull(),
  /** Percent, e.g. 13.00000. Null for flat-amount taxes. */
  rate: numeric("rate", { precision: 9, scale: 5 }),
  /** Flat tax in cents (Clover taxAmount). Null for percentage taxes. */
  taxAmount: integer("tax_amount"),
  /** VAT_TAXABLE | VAT_NON_TAXABLE | VAT_EXEMPT | INTERNAL_TAX | PARTNER_TAX. */
  taxType: text("tax_type"),
  isDefault: boolean("is_default").notNull().default(false),
  active: boolean("active").notNull().default(true),
  cloverTaxRateId: text("clover_tax_rate_id").unique(),
  cloverLastSyncedAt: bigint("clover_last_synced_at", { mode: "number" }),
});

/** M:N product ↔ tax rate (Clover tax_rate_items). */
export const productTaxRates = pgTable(
  "product_tax_rates",
  {
    ...updatableColumns("ptx"),
    productId: bigint("product_id", { mode: "bigint" })
      .notNull()
      .references(() => products.id),
    taxRateId: bigint("tax_rate_id", { mode: "bigint" })
      .notNull()
      .references(() => taxRates.id),
  },
  (t) => [uniqueIndex("product_tax_rates_prod_tax_uidx").on(t.productId, t.taxRateId)],
);

/** Clover tags — the "Order printing" labels shown on the Register item form. */
export const printerLabels = pgTable("printer_labels", {
  ...updatableColumns("lbl"),
  name: text("name").notNull(),
  showInReporting: boolean("show_in_reporting").notNull().default(false),
  active: boolean("active").notNull().default(true),
  cloverTagId: text("clover_tag_id").unique(),
  cloverLastSyncedAt: bigint("clover_last_synced_at", { mode: "number" }),
});

/** M:N product ↔ printer label (Clover tag_items). */
export const productPrinterLabels = pgTable(
  "product_printer_labels",
  {
    ...updatableColumns("ppl"),
    productId: bigint("product_id", { mode: "bigint" })
      .notNull()
      .references(() => products.id),
    printerLabelId: bigint("printer_label_id", { mode: "bigint" })
      .notNull()
      .references(() => printerLabels.id),
  },
  (t) => [uniqueIndex("product_printer_labels_prod_label_uidx").on(t.productId, t.printerLabelId)],
);

/**
 * Clover online-ordering menus (`/v3/merchants/{mId}/menus`).
 *
 * An earlier note here claimed Clover had no Menus resource and that Register
 * menus were just categories — that was wrong. Clover has real menus, one per
 * delivery channel (Uber Eats, DoorDash), each with its own item list and its
 * own prices. They are owned and published in Clover, so these rows are a
 * read-only mirror.
 */
export const menus = pgTable("menus", {
  ...updatableColumns("mnu"),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  cloverMenuId: text("clover_menu_id").unique(),
  /** e.g. OLO_MENU. */
  cloverMenuType: text("clover_menu_type"),
  /** Clover provider ids this menu publishes to; Clover exposes no name lookup. */
  cloverProviderIds: text("clover_provider_ids").array(),
  /** Epoch ms Clover published it; null = never published. */
  cloverPublishedAt: bigint("clover_published_at", { mode: "number" }),
  cloverFallbackMenu: boolean("clover_fallback_menu").notNull().default(false),
  cloverLastSyncedAt: bigint("clover_last_synced_at", { mode: "number" }),
});

/**
 * A product's entry on one menu. `price` is what that channel charges and
 * `basePrice` is the register price — the delivery markup lives in the gap, so
 * both are stored rather than derived.
 */
export const menuItems = pgTable(
  "menu_items",
  {
    ...updatableColumns("mni"),
    menuId: bigint("menu_id", { mode: "bigint" })
      .notNull()
      .references(() => menus.id),
    productId: bigint("product_id", { mode: "bigint" })
      .notNull()
      .references(() => products.id),
    /** Menu price in dollars (Clover stores cents). */
    price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
    /** Register price in dollars, as Clover reported it on this menu. */
    basePrice: numeric("base_price", { precision: 10, scale: 2 }),
    enabled: boolean("enabled").notNull().default(true),
    cloverLastSyncedAt: bigint("clover_last_synced_at", { mode: "number" }),
  },
  (t) => [uniqueIndex("menu_items_menu_product_uidx").on(t.menuId, t.productId)],
);

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
