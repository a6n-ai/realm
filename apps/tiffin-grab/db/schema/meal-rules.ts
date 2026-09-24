import { updatableColumns } from "@foundry/database";
import { bigint, boolean, index, integer, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { mealSizes, plans } from "./catalog";
import { organization } from "./organizations";

/**
 * Configurable meal constraints evaluated against a proposed final meal
 * (picks + post-swap category counts). Empty table = no extra constraints —
 * existing orders keep working without backfill.
 *
 * A rule is: SCOPE (which orders it applies to) + WHEN (conditions matching
 * individual picks) + THEN (an action on how many picks may match).
 *
 * Scope lives in columns rather than conditions because it selects which rules
 * to LOAD for an order (indexed lookup), whereas conditions filter dishes
 * WITHIN a loaded rule. A meal size is a property of the order, not of a dish,
 * so it belongs here and not in the condition list.
 *
 * Deliberately NOT owned here (each keeps its existing home):
 *   meal_size_items.max_tu_amount ......... TU ceiling per category
 *   dish_categories.max_picks_per_tiffin .. pick ceiling per category
 *   category_swap_pairs ................... swap eligibility
 *   meal-size/plan dish allowlists ........ serving safety
 */
export const mealRuleCondition = pgEnum("meal_rule_condition", ["exclusive_to_plan"]);

/** AND / OR across a rule's conditions. Flat by design — no nested expressions. */
export const mealRuleMatchMode = pgEnum("meal_rule_match_mode", ["all", "any"]);

export const mealRuleAction = pgEnum("meal_rule_action", [
  /** At most `actionValue` picks may match the conditions. */
  "max_qualifying",
  /** No pick may match (max 0, with a clearer message). */
  "forbid",
  /** At most one DISTINCT matching dish may appear in the meal. */
  "cannot_coexist",
]);

/**
 * Which property of a pick a condition tests.
 *
 * `dish_plan` is the Diet axis: there is no dish.type column — diet is derived
 * through dishes.plan_id -> plans.key. Note this is the DISH's plan, which is
 * not always the ORDER's plan (a non-veg meal size can carry a veg sabzi slot),
 * which is exactly why scope and conditions are separate.
 */
export const mealRuleField = pgEnum("meal_rule_field", [
  "dish_plan",
  "category",
  "dish",
  "dish_name",
]);

export const mealRuleOperator = pgEnum("meal_rule_operator", [
  "is",
  "is_not",
  "is_one_of",
  "is_not_one_of",
  // dish_name only — matching is case-insensitive.
  "contains",
  "not_contains",
  "equals",
  "starts_with",
  "ends_with",
]);

export const mealRules = pgTable("meal_rules", {
  ...updatableColumns("mlr"),
  /** Admin-facing label, e.g. "One non-veg sabzi". */
  name: text("name"),
  /**
   * Customer-facing explanation, shown in the meal picker and when a pick is
   * refused. NULL = generate one from the rule (lib/menu/meal-rule-text).
   */
  description: text("description"),
  /** SCOPE. NULL = applies to every plan / every meal size. */
  scopePlanId: bigint("scope_plan_id", { mode: "bigint" }).references(() => plans.id, { onDelete: "cascade" }),
  scopeMealSizeId: bigint("scope_meal_size_id", { mode: "bigint" }).references(() => mealSizes.id, {
    onDelete: "cascade",
  }),
  matchMode: mealRuleMatchMode("match_mode").notNull().default("all"),
  action: mealRuleAction("action").notNull().default("max_qualifying"),
  /** Required by max_qualifying; unused by forbid / cannot_coexist. */
  actionValue: integer("action_value"),
  /** Only orders messages deterministically — evaluation still fails on the first violation. */
  priority: integer("priority").notNull().default(0),
  enabled: boolean("enabled").notNull().default(true),

  // --- Legacy single-condition shape. Backfilled into meal_rule_conditions by
  // migration 00NN and dropped in a later one, once the new path has run in prod.
  planId: bigint("plan_id", { mode: "bigint" }).references(() => plans.id, { onDelete: "cascade" }),
  categoryKey: text("category_key"),
  condition: mealRuleCondition("condition"),
  maxCount: integer("max_count"),

  organizationId: text("organization_id").references(() => organization.id),
}, (t) => [
  index("meal_rules_scope_plan_idx").on(t.scopePlanId),
  index("meal_rules_scope_meal_size_idx").on(t.scopeMealSizeId),
  index("meal_rules_plan_idx").on(t.planId),
]);

/**
 * One WHEN clause. Rows rather than a JSON blob so each predicate can be
 * validated and indexed on its own, and so the admin grid can join to show
 * which rules reference a dish or category.
 *
 * Exactly one value column is populated, per `field`:
 *   dish_plan / dish -> valueIds (plans.id / dishes.id)
 *   category ........ -> valueKeys (dish_categories.key; soft ref, matching the
 *                       existing meal_size_items.category pattern)
 *   dish_name ....... -> valueText
 */
export const mealRuleConditions = pgTable("meal_rule_conditions", {
  ...updatableColumns("mrc"),
  ruleId: bigint("rule_id", { mode: "bigint" })
    .notNull()
    .references(() => mealRules.id, { onDelete: "cascade" }),
  field: mealRuleField("field").notNull(),
  operator: mealRuleOperator("operator").notNull(),
  valueIds: bigint("value_ids", { mode: "bigint" }).array(),
  valueKeys: text("value_keys").array(),
  valueText: text("value_text"),
  organizationId: text("organization_id").references(() => organization.id),
}, (t) => [index("meal_rule_conditions_rule_idx").on(t.ruleId)]);
