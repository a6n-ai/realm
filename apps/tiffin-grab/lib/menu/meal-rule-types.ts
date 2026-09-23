/**
 * The shape the rule engine evaluates. Kept separate from the drizzle schema so
 * the validator stays a pure function over plain data — it is unit-tested that
 * way today and should remain testable without a database.
 */

export type MealRuleField = "dish_plan" | "category" | "dish" | "dish_name";

export type MealRuleOperator =
  | "is"
  | "is_not"
  | "is_one_of"
  | "is_not_one_of"
  | "contains"
  | "not_contains"
  | "equals"
  | "starts_with"
  | "ends_with";

export type MealRuleAction = "max_qualifying" | "forbid" | "cannot_coexist";

export type MealRuleCondition = {
  field: MealRuleField;
  operator: MealRuleOperator;
  /** plans.id for dish_plan; dishes.id for dish. */
  valueIds?: bigint[] | null;
  /** dish_categories.key for category. */
  valueKeys?: string[] | null;
  /** dish_name only. */
  valueText?: string | null;
  /**
   * Pre-resolved names for valueIds, when a caller already has them (the admin
   * builder does). Display only — the engine never reads this.
   */
  displayValues?: string[] | null;
};

export type MealRule = {
  publicId: string;
  name?: string | null;
  description?: string | null;
  matchMode: "all" | "any";
  action: MealRuleAction;
  actionValue?: number | null;
  priority: number;
  conditions: MealRuleCondition[];
};

/**
 * One pick in the proposed meal, hydrated with everything a condition can test.
 * `dishPlanId` is the DISH's plan (the Diet axis), which is not necessarily the
 * order's plan — a non-veg meal size can carry a veg-tagged sabzi slot.
 */
export type HydratedPick = {
  dishId: bigint;
  dishName: string;
  dishPlanId: bigint;
  category: string;
};

/** Which operators are meaningful for each field — the admin UI reads this too. */
export const OPERATORS_BY_FIELD: Record<MealRuleField, MealRuleOperator[]> = {
  dish_plan: ["is", "is_not", "is_one_of", "is_not_one_of"],
  category: ["is", "is_not", "is_one_of", "is_not_one_of"],
  dish: ["is", "is_not", "is_one_of", "is_not_one_of"],
  dish_name: ["contains", "not_contains", "equals", "starts_with", "ends_with"],
};
