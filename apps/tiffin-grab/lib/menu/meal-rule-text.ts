import type { MealRule, MealRuleCondition } from "./meal-rule-types";

/**
 * Turns a rule into one customer-readable sentence.
 *
 * Used for BOTH the auto-generated fallback (when an admin leaves `description`
 * blank) and the live preview in the admin builder, so an admin previews exactly
 * the sentence a customer will read.
 *
 * Deliberately covers only the shapes that generate clean English. Anything more
 * tangled falls back to a vague-but-honest line rather than emitting something
 * unreadable — that fallback is the signal to an admin that this rule needs a
 * written description.
 */

export type RuleLabels = {
  /** dish_categories.key -> label */
  category: Record<string, string>;
  /** plans.id (as string) -> name */
  plan: Record<string, string>;
  /** dishes.id (as string) -> name */
  dish: Record<string, string>;
};

const EMPTY: RuleLabels = { category: {}, plan: {}, dish: {} };

function joinOr(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} or ${parts.at(-1)}`;
}

function values(c: MealRuleCondition, labels: RuleLabels): string[] {
  // A caller that already resolved the names (the admin builder) passes them
  // straight through, so no id lookup table is needed.
  if (c.displayValues?.length) return c.displayValues;
  if (c.field === "category") return (c.valueKeys ?? []).map((k) => labels.category[k] ?? k);
  if (c.field === "dish_plan") return (c.valueIds ?? []).map((id) => labels.plan[String(id)] ?? String(id));
  if (c.field === "dish") return (c.valueIds ?? []).map((id) => labels.dish[String(id)] ?? String(id));
  return c.valueText ? [c.valueText] : [];
}

/** A noun phrase for one condition, e.g. "Non-Veg" or "named like “Paneer”". */
function phrase(c: MealRuleCondition, labels: RuleLabels): string | null {
  const vals = values(c, labels);
  if (vals.length === 0) return null;
  const list = joinOr(vals);
  switch (c.operator) {
    case "is":
    case "is_one_of":
    case "equals":
      return list;
    case "is_not":
    case "is_not_one_of":
      return `not ${list}`;
    case "contains":
      return `named like “${list}”`;
    case "not_contains":
      return `not named like “${list}”`;
    case "starts_with":
      return `starting with “${list}”`;
    case "ends_with":
      return `ending with “${list}”`;
    default:
      return null;
  }
}

/**
 * Builds the dish noun: diet and dish-name qualify the category, so
 * (Diet=Non-Veg, Category=Sabzi) reads "Non-Veg Sabzi" rather than
 * "dishes matching Non-Veg and Sabzi".
 */
function subject(rule: MealRule, labels: RuleLabels): string | null {
  const byField = new Map<string, MealRuleCondition[]>();
  for (const c of rule.conditions) {
    byField.set(c.field, [...(byField.get(c.field) ?? []), c]);
  }
  // More than one condition on the same field is where readable English breaks down.
  if ([...byField.values()].some((cs) => cs.length > 1)) return null;

  const diet = byField.get("dish_plan")?.[0];
  const category = byField.get("category")?.[0];
  const dish = byField.get("dish")?.[0];
  const name = byField.get("dish_name")?.[0];

  if (dish && !category && !diet && !name) {
    const p = phrase(dish, labels);
    return p ? `${p}` : null;
  }

  const parts: string[] = [];
  if (diet) {
    const p = phrase(diet, labels);
    if (!p) return null;
    parts.push(p);
  }
  if (category) {
    const p = phrase(category, labels);
    if (!p) return null;
    parts.push(p);
  }
  let head = parts.join(" ");
  if (!head) head = "dish";
  if (name) {
    const p = phrase(name, labels);
    if (!p) return null;
    head = `${head} ${p}`;
  }
  return head;
}

export function generateDescription(rule: MealRule, labels: RuleLabels = EMPTY): string {
  const VAGUE = "Some dishes are limited in this meal.";
  if (rule.conditions.length === 0) return VAGUE;
  // "any" reads as a list of alternatives, which the noun-phrase builder can't express.
  if (rule.matchMode === "any" && rule.conditions.length > 1) return VAGUE;

  const noun = subject(rule, labels);
  if (!noun) return VAGUE;

  switch (rule.action) {
    case "forbid":
      return `You can’t choose ${noun} in this meal.`;
    case "cannot_coexist":
      return `You can choose only one of: ${noun}.`;
    case "max_qualifying": {
      const n = rule.actionValue ?? 0;
      if (n <= 0) return `You can’t choose ${noun} in this meal.`;
      return `You can choose at most ${n} ${noun} in this meal.`;
    }
    default:
      return VAGUE;
  }
}

/** The sentence a customer sees: the admin's own words when they wrote any. */
export function ruleText(rule: MealRule, labels: RuleLabels = EMPTY): string {
  const written = rule.description?.trim();
  return written ? written : generateDescription(rule, labels);
}
