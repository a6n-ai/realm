import { baseColumns, updatableColumns } from "@realm/database";
import { bigint, index, integer, numeric, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { mealSizes, weightUnit } from "./catalog";
import { deliveries } from "./deliveries";

// Admin-defined, scoped to a meal size. Directional: giving up `qtyFrom` units of
// fromCategory buys `qtyTo` units of toCategory. A bidirectional swap is two rows
// (A->B and B->A) — the admin adds both if they want it to work both ways.
export const categorySwapRules = pgTable("category_swap_rules", {
  ...updatableColumns("csr"),
  mealSizeId: bigint("meal_size_id", { mode: "bigint" })
    .notNull()
    .references(() => mealSizes.id, { onDelete: "cascade" }),
  // Soft refs to dish_categories.key, same convention as meal_size_items.category —
  // no DB FK, validated server-side against dishCategoriesService.enabledCategories().
  fromCategory: text("from_category").notNull(),
  toCategory: text("to_category").notNull(),
  qtyFrom: integer("qty_from").notNull(),
  qtyTo: integer("qty_to").notNull(),
  // Portion of ONE unit of toCategory. NULL = fall back to that category's own
  // meal_size_items line, i.e. the behaviour before swaps carried portions.
  toWeightValue: numeric("to_weight_value", { precision: 6, scale: 2 }),
  toWeightUnit: weightUnit("to_weight_unit"),
}, (t) => [
  // A meal size can't have two rules with the same direction — edit qty on the
  // existing one instead (same "remove and re-add to change identity" convention
  // as meal_payout_combo_unique).
  uniqueIndex("category_swap_rules_direction_unique").on(t.mealSizeId, t.fromCategory, t.toCategory),
]);

// Which rule is applied to which specific delivery. One row per applied swap; a
// delivery can have multiple swaps stacked (row per rule applied). Snapshots the
// rule's fromCategory/toCategory/qtyFrom/qtyTo AT APPLY TIME — never re-read from
// the rule after — so an admin editing/deleting a rule can never retroactively
// change a swap a customer already applied to an upcoming delivery. Same
// "snapshot, don't re-derive" principle as orders.categoryCounts.
export const deliveryCategorySwaps = pgTable("delivery_category_swaps", {
  ...baseColumns("dcs"),
  deliveryId: bigint("delivery_id", { mode: "bigint" })
    .notNull()
    .references(() => deliveries.id, { onDelete: "cascade" }),
  // No .references(): categorySwapRules rows are hard-deletable independent of
  // applied history; this column is for traceability only.
  ruleId: bigint("rule_id", { mode: "bigint" }),
  fromCategory: text("from_category").notNull(),
  toCategory: text("to_category").notNull(),
  qtyFrom: integer("qty_from").notNull(),
  qtyTo: integer("qty_to").notNull(),
  // Snapshotted from the rule at apply time, like qtyFrom/qtyTo above.
  toWeightValue: numeric("to_weight_value", { precision: 6, scale: 2 }),
  toWeightUnit: weightUnit("to_weight_unit"),
}, (t) => [
  // Applying the same rule twice to one delivery is a no-op/error, not a stacked
  // double-swap. Applying two DIFFERENT rules to the same delivery is allowed.
  uniqueIndex("delivery_category_swaps_delivery_rule_unique").on(t.deliveryId, t.ruleId),
  index("delivery_category_swaps_delivery_idx").on(t.deliveryId),
]);
