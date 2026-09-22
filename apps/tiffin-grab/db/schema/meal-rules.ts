import { updatableColumns } from "@foundry/database";
import { bigint, boolean, integer, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { plans } from "./catalog";
import { organization } from "./organizations";

/**
 * Configurable meal constraints evaluated against a proposed final meal
 * (picks + post-swap category counts). Empty table = no extra constraints —
 * existing orders keep working without backfill.
 *
 * `exclusive_to_plan` reuses `exclusiveDishIdsForPlan`: dishes attached only to
 * this plan among siblings of the same plan type (e.g. non-veg-only sabzi), not
 * a veg/non-veg column on the dish.
 */
export const mealRuleCondition = pgEnum("meal_rule_condition", ["exclusive_to_plan"]);

export const mealRules = pgTable(
  "meal_rules",
  {
    ...updatableColumns("mlr"),
    planId: bigint("plan_id", { mode: "bigint" })
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    // Soft ref to dish_categories.key (same pattern as meal_size_items.category).
    categoryKey: text("category_key").notNull(),
    condition: mealRuleCondition("condition").notNull(),
    maxCount: integer("max_count").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    organizationId: text("organization_id").references(() => organization.id),
  },
  (t) => [
    uniqueIndex("meal_rules_plan_category_condition_unique").on(t.planId, t.categoryKey, t.condition),
  ],
);
