import { ValidationError } from "@foundry/commons";
import { OPERATORS_BY_FIELD, type MealRuleAction, type MealRuleField, type MealRuleOperator } from "./meal-rule-types";

/**
 * The admin-facing shape of a rule. Values are PUBLIC ids and category keys —
 * the builder never sees or sends an internal database id, and the service
 * resolves these while checking that each one still exists.
 */
export type RuleConditionInput = {
  field: MealRuleField;
  operator: MealRuleOperator;
  /** dishes.public_id (field=dish) or plans.public_id (field=dish_plan). */
  valuePublicIds?: string[] | null;
  /** dish_categories.key (field=category). */
  valueKeys?: string[] | null;
  /** field=dish_name. */
  valueText?: string | null;
};

export type RuleInput = {
  name: string;
  description?: string | null;
  scopePlanPublicId?: string | null;
  scopeMealSizePublicId?: string | null;
  matchMode: "all" | "any";
  action: MealRuleAction;
  actionValue?: number | null;
  enabled?: boolean;
  conditions: RuleConditionInput[];
};

const FIELDS: MealRuleField[] = ["dish_plan", "category", "dish", "dish_name"];
const ACTIONS: MealRuleAction[] = ["max_qualifying", "forbid", "cannot_coexist"];

/** Which value column a field uses — one, never more. */
export function valueKindFor(field: MealRuleField): "ids" | "keys" | "text" {
  if (field === "category") return "keys";
  if (field === "dish_name") return "text";
  return "ids";
}

/** `is` / `is_not` take exactly one value; the *_one_of forms take one or more. */
function expectsSingleValue(operator: MealRuleOperator): boolean {
  return operator === "is" || operator === "is_not";
}

export const FIELD_LABEL: Record<MealRuleField, string> = {
  dish_plan: "Diet",
  category: "Category",
  dish: "Dish",
  dish_name: "Dish name",
};

/**
 * Shape validation with no database access, so it can be unit-tested and reused
 * by the admin form. Existence of the referenced rows is checked separately by
 * the service — never trust the client for either half.
 */
export function assertValidRuleInput(input: RuleInput): void {
  if (!input.name?.trim()) throw new ValidationError("Give the rule a name.");
  if (input.name.trim().length > 120) throw new ValidationError("Rule name is too long.");

  if (!ACTIONS.includes(input.action)) throw new ValidationError("Choose a valid action.");
  if (input.matchMode !== "all" && input.matchMode !== "any") {
    throw new ValidationError("Choose whether all or any of the conditions must match.");
  }

  if (input.action === "max_qualifying") {
    const v = input.actionValue;
    if (v == null || !Number.isInteger(v) || v < 0 || v > 99) {
      throw new ValidationError("Set a maximum between 0 and 99.");
    }
  }

  if (!Array.isArray(input.conditions) || input.conditions.length === 0) {
    // A rule with no conditions would match nothing, so it would look active in
    // the admin list and do nothing at all.
    throw new ValidationError("Add at least one condition.");
  }
  if (input.conditions.length > 10) throw new ValidationError("That is too many conditions for one rule.");

  input.conditions.forEach((c, i) => {
    const where = `Condition ${i + 1}`;
    if (!FIELDS.includes(c.field)) throw new ValidationError(`${where}: choose a field.`);
    if (!OPERATORS_BY_FIELD[c.field].includes(c.operator)) {
      // e.g. "Category contains" — the engine refuses to evaluate it, so it must
      // never be storable in the first place.
      throw new ValidationError(`${where}: “${c.operator}” cannot be used with ${FIELD_LABEL[c.field]}.`);
    }

    const kind = valueKindFor(c.field);
    if (kind === "text") {
      const text = c.valueText?.trim();
      if (!text) throw new ValidationError(`${where}: enter some text to match.`);
      if (text.length > 80) throw new ValidationError(`${where}: that text is too long.`);
      if (c.valuePublicIds?.length || c.valueKeys?.length) {
        throw new ValidationError(`${where}: unexpected value for ${FIELD_LABEL[c.field]}.`);
      }
      return;
    }

    const values = kind === "ids" ? (c.valuePublicIds ?? []) : (c.valueKeys ?? []);
    if (values.length === 0) throw new ValidationError(`${where}: choose a value.`);
    if (values.some((v) => !v?.trim())) throw new ValidationError(`${where}: choose a value.`);
    if (new Set(values).size !== values.length) throw new ValidationError(`${where}: remove the duplicate values.`);
    if (expectsSingleValue(c.operator) && values.length > 1) {
      throw new ValidationError(`${where}: “is” takes one value — use “is one of” for several.`);
    }
    if (c.valueText?.trim()) throw new ValidationError(`${where}: unexpected text for ${FIELD_LABEL[c.field]}.`);
    if (kind === "ids" && c.valueKeys?.length) throw new ValidationError(`${where}: unexpected value.`);
    if (kind === "keys" && c.valuePublicIds?.length) throw new ValidationError(`${where}: unexpected value.`);
  });
}
